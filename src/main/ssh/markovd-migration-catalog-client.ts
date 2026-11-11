import {
  hasModernAutomationLaunchSetup,
  automationCanonicalLaunchSetup
} from '../../shared/automation-launch-setup'
import { AUTOMATION_LAUNCH_SETUP_RUNTIME_CAPABILITY } from '../../shared/automation-runtime-capabilities'
import { z } from 'zod'
import { pairedRuntimeConnectionFromOffer } from '../../shared/remote-runtime/pairing/paired-runtime-connection'
import {
  parseMarkovdMigrationCatalogAbortResult,
  parseMarkovdMigrationCatalogState
} from '../../shared/markovd-migration/markovd-migration-catalog-state'
import type {
  MarkovdMigrationCatalogAbortResult,
  MarkovdMigrationCatalogState,
  MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'
import {
  parseMarkovdMigrationSnapshotChunkResult,
  type MarkovdMigrationSnapshotChunkRequest,
  type MarkovdMigrationSnapshotChunkResult
} from '../../shared/markovd-migration/markovd-migration-scrollback'
import {
  findUnsupportedMigrationBlobKind,
  markovdMigrationBlobKindUnsupportedBlocker,
  parseMarkovdMigrationBlobChunkResult,
  type MarkovdMigrationBlobChunkRequest,
  type MarkovdMigrationBlobChunkResult,
  type MarkovdMigrationBlobDescriptor
} from '../../shared/markovd-migration/markovd-migration-blob-transfer'
import { markovdMigrationManifestBlobs } from '../../shared/markovd-migration/markovd-migration-automation-run-history'
import { parsePairingCode } from '../../shared/remote-runtime/pairing/pairing'
import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../shared/electron-remote-runtime-client-capabilities'
import { MARKOVD_MIGRATION_CATALOG_RUNTIME_CAPABILITY } from '../../shared/markovd-runtime-capabilities'
import { sendRemoteRuntimeRequestWithStatusPreflight } from '../../shared/remote-runtime/remote-runtime-client'
import { assertMarkovdMigrationRequestFits } from './markovd-migration-manifest-export'
import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import { AUTOMATION_EXTRA_AGENT_ARGS_RUNTIME_CAPABILITY } from '../../shared/protocol-version'
import { hasExtraAgentArgs } from '../../shared/agent-launch/startup/automation-extra-agent-args'
import { requiredMarkovdMigrationSourceCapability } from '../../shared/markovd-migration/markovd-migration-source-kind'
import type { MarkovdServerRepository } from './markovd-migration-repository-link'

type MarkovdCatalogMigrationOperation = 'abort' | 'commit' | 'stage' | 'state'

/** Missing capability/method is definite refusal; other failures require catalog re-read because a lost reply may hide staged state. */
export const MARKOVD_MIGRATION_DESTINATION_UNSUPPORTED = 'markovd_migration_destination_unsupported'
/** Refuse older destinations that would silently strip extra agent arguments. */
export const MARKOVD_MIGRATION_DESTINATION_EXTRA_AGENT_ARGS_UNSUPPORTED =
  'markovd_migration_destination_extra_agent_args_unsupported:Update Markov on this host to use extra arguments.'
/** Unsupported source kinds are refused before any staging request. */
export const MARKOVD_MIGRATION_DESTINATION_SOURCE_KIND_UNSUPPORTED =
  'markovd_migration_destination_source_kind_unsupported:Update Markov on this host to move this project to it.'

export type CatalogRequestOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  expectedRuntimeId?: string
}

const METHOD_BY_OPERATION: Record<MarkovdCatalogMigrationOperation, string> = {
  abort: 'markovd.migration.abortCatalog',
  commit: 'markovd.migration.commitCatalog',
  stage: 'markovd.migration.stageCatalog',
  state: 'markovd.migration.catalogState'
}

export function stageRemoteMarkovdMigrationCatalog(
  pairingCode: string,
  manifest: MarkovdMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<MarkovdMigrationCatalogState> {
  return requestCatalogState(pairingCode, 'stage', manifest, options)
}

/** Expected blobs make the destination refuse incomplete commits. */
export async function commitRemoteMarkovdMigrationCatalog(
  pairingCode: string,
  manifest: MarkovdMigrationManifest,
  options: CatalogRequestOptions & {
    expectedBlobs?: readonly MarkovdMigrationBlobDescriptor[]
  } = {}
): Promise<MarkovdMigrationCatalogState> {
  const result = await request(pairingCode, 'commit', manifest, options, options.expectedBlobs)
  return parseMarkovdMigrationCatalogState(result, manifest)
}

export function readRemoteMarkovdMigrationCatalogState(
  pairingCode: string,
  manifest: MarkovdMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<MarkovdMigrationCatalogState> {
  return requestCatalogState(pairingCode, 'state', manifest, options)
}

export async function abortRemoteMarkovdMigrationCatalog(
  pairingCode: string,
  manifest: MarkovdMigrationManifest,
  options: CatalogRequestOptions = {}
): Promise<MarkovdMigrationCatalogAbortResult> {
  const result = await request(pairingCode, 'abort', manifest, options)
  const parsed = parseMarkovdMigrationCatalogAbortResult(result, manifest)
  // Older already-absent replies prove no durability, unlike real aborts.
  if (parsed.state === 'absent' && !parsed.aborted && parsed.durableAbsent !== true) {
    throw new Error('markovd_migration_abort_durability_unverifiable:destination_update_required')
  }
  return parsed
}

export async function stageRemoteMarkovdMigrationSnapshotChunk(
  pairingCode: string,
  request: MarkovdMigrationSnapshotChunkRequest,
  options: CatalogRequestOptions = {}
): Promise<MarkovdMigrationSnapshotChunkResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('markovd_migration_pairing_code_invalid')
  }
  const response = await sendSupportedMigrationRequest(
    pairing,
    'markovd.migration.stageSnapshotChunk',
    request,
    options
  )
  if (!response.ok) {
    throw new Error(`markovd_migration_snapshot_failed:${response.error.message}`)
  }
  return parseMarkovdMigrationSnapshotChunkResult(response.result, request)
}

export async function stageRemoteMarkovdMigrationBlobChunk(
  pairingCode: string,
  request: MarkovdMigrationBlobChunkRequest,
  options: CatalogRequestOptions = {}
): Promise<MarkovdMigrationBlobChunkResult> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('markovd_migration_pairing_code_invalid')
  }
  const response = await sendSupportedMigrationRequest(
    pairing,
    'markovd.migration.stageBlobChunk',
    request,
    options,
    false,
    null,
    // Recheck every request so a downgraded destination cannot stage an unsupported blob kind.
    (capabilities) => {
      const unsupported = findUnsupportedMigrationBlobKind([request.blob], capabilities)
      if (unsupported) {
        throw new Error(markovdMigrationBlobKindUnsupportedBlocker(unsupported))
      }
    }
  )
  if (!response.ok) {
    throw new Error(`markovd_migration_blob_failed:${response.error.message}`)
  }
  return parseMarkovdMigrationBlobChunkResult(response.result, request)
}

export async function listServerRows(
  pairingCode: string,
  method: string,
  rows: string,
  options: CatalogRequestOptions
): Promise<unknown> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('markovd_migration_pairing_code_invalid')
  }
  const response = await sendSupportedMigrationRequest(pairing, method, undefined, options)
  if (!response.ok) {
    throw new Error(`markovd_migration_${rows}_failed:${response.error.message}`)
  }
  return response.result
}

// repo.list returns full stored rows; omitted host fields identify server-local repos.
const ServerRepositoriesSchema = z.object({
  repos: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      connectionId: z.string().nullish(),
      executionHostId: z.string().nullish(),
      projectGroupId: z.string().nullish()
    })
  )
})

export async function listRemoteMarkovdRepositories(
  pairingCode: string,
  options: CatalogRequestOptions = {}
): Promise<MarkovdServerRepository[]> {
  const result = await listServerRows(pairingCode, 'repo.list', 'repositories', options)
  return ServerRepositoriesSchema.parse(result).repos.map(
    ({ id, path, connectionId, executionHostId, projectGroupId }) => ({
      id,
      path,
      ...(connectionId != null ? { connectionId } : {}),
      ...(executionHostId != null ? { executionHostId } : {}),
      ...(projectGroupId != null ? { projectGroupId } : {})
    })
  )
}

async function requestCatalogState(
  pairingCode: string,
  operation: Exclude<MarkovdCatalogMigrationOperation, 'abort'>,
  manifest: MarkovdMigrationManifest,
  options: CatalogRequestOptions
): Promise<MarkovdMigrationCatalogState> {
  const result = await request(pairingCode, operation, manifest, options)
  return parseMarkovdMigrationCatalogState(result, manifest)
}

async function request(
  pairingCode: string,
  operation: MarkovdCatalogMigrationOperation,
  manifest: MarkovdMigrationManifest,
  options: CatalogRequestOptions,
  expectedBlobs: readonly MarkovdMigrationBlobDescriptor[] = []
): Promise<unknown> {
  const pairing = parsePairingCode(pairingCode)
  if (!pairing) {
    throw new Error('markovd_migration_pairing_code_invalid')
  }
  // Preserve exact { manifest } wire shape for blob-free and SSH moves.
  const params = expectedBlobs.length > 0 ? { manifest, expectedBlobs } : { manifest }
  // Validation-size limits can exceed sealed-frame capacity; reject before the host closes the socket.
  assertMarkovdMigrationRequestFits(params)
  const imports = operation === 'stage' || operation === 'commit'
  const carriesExtraAgentArgs =
    imports &&
    (manifest.payload.dormantState?.automations ?? []).some((automation) =>
      hasExtraAgentArgs(automation.extraAgentArgs)
    )
  // An older host would drop the blob a manifest names and import without its rows.
  const requiredBlobs = imports
    ? [...expectedBlobs, ...markovdMigrationManifestBlobs(manifest)]
    : expectedBlobs
  const response = await sendSupportedMigrationRequest(
    pairing,
    METHOD_BY_OPERATION[operation],
    params,
    options,
    carriesExtraAgentArgs,
    // Recheck source capabilities on every operation; older hosts may misparse non-SSH sources.
    requiredMarkovdMigrationSourceCapability(manifest.source),
    // Hosts without blob capability would strip expectedBlobs and commit unchecked.
    (capabilities) => {
      if (
        imports &&
        (manifest.payload.dormantState?.automations ?? []).some((automation) =>
          hasModernAutomationLaunchSetup(automationCanonicalLaunchSetup(automation))
        ) &&
        !capabilities.includes(AUTOMATION_LAUNCH_SETUP_RUNTIME_CAPABILITY)
      ) {
        throw new Error(
          'Update Markov on the destination host to keep automation agent launch settings.'
        )
      }
      const unsupported = findUnsupportedMigrationBlobKind(requiredBlobs, capabilities)
      if (unsupported) {
        throw new Error(markovdMigrationBlobKindUnsupportedBlocker(unsupported))
      }
    }
  )
  if (!response.ok) {
    throw new Error(`markovd_migration_${operation}_failed:${response.error.message}`)
  }
  return response.result
}

export async function sendSupportedMigrationRequest(
  pairing: NonNullable<ReturnType<typeof parsePairingCode>>,
  method: string,
  params: unknown,
  options: CatalogRequestOptions,
  requiresExtraAgentArgs = false,
  requiredSourceCapability: string | null = null,
  assertCapabilities: (capabilities: readonly string[]) => void = () => {}
): Promise<RuntimeRpcResponse<unknown>> {
  const response = await sendRemoteRuntimeRequestWithStatusPreflight<unknown>(
    pairedRuntimeConnectionFromOffer(pairing),
    method,
    params,
    options.timeoutMs ?? 15_000,
    (status) => {
      if (!status.ok) {
        throw new Error(`markovd_migration_status_failed:${status.error.message}`)
      }
      if (
        options.expectedRuntimeId !== undefined &&
        status._meta?.runtimeId !== options.expectedRuntimeId
      ) {
        throw new Error('markovd_migration_destination_runtime_mismatch')
      }
      if (!status.result.capabilities?.includes(MARKOVD_MIGRATION_CATALOG_RUNTIME_CAPABILITY)) {
        throw new Error(MARKOVD_MIGRATION_DESTINATION_UNSUPPORTED)
      }
      if (
        requiresExtraAgentArgs &&
        !status.result.capabilities?.includes(AUTOMATION_EXTRA_AGENT_ARGS_RUNTIME_CAPABILITY)
      ) {
        throw new Error(MARKOVD_MIGRATION_DESTINATION_EXTRA_AGENT_ARGS_UNSUPPORTED)
      }
      if (
        requiredSourceCapability !== null &&
        !status.result.capabilities?.includes(requiredSourceCapability)
      ) {
        throw new Error(MARKOVD_MIGRATION_DESTINATION_SOURCE_KIND_UNSUPPORTED)
      }
      assertCapabilities(status.result.capabilities ?? [])
    },
    undefined,
    ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES,
    options.signal
  )
  if (!response.ok && response.error.code === 'method_not_found') {
    throw new Error(MARKOVD_MIGRATION_DESTINATION_UNSUPPORTED)
  }
  if (
    options.expectedRuntimeId !== undefined &&
    response._meta?.runtimeId !== options.expectedRuntimeId
  ) {
    throw new Error('markovd_migration_destination_runtime_mismatch')
  }
  return response
}
