/** Keep source authority until durable destination commit. Verify the fenced export before stage/commit; resolve lost replies by catalog reads and persist journal transitions before returning. Never release a committed destination. */
import type {
  MarkovdMigrationCatalogAbortResult,
  MarkovdMigrationCatalogReference,
  MarkovdMigrationCatalogReferenceAbortResult,
  MarkovdMigrationCatalogState,
  MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'
import type {
  MarkovdMigrationSnapshotChunkRequest,
  MarkovdMigrationSnapshotChunkResult
} from '../../shared/markovd-migration/markovd-migration-scrollback'
import type {
  MarkovdMigrationBlobChunkRequest,
  MarkovdMigrationBlobChunkResult
} from '../../shared/markovd-migration/markovd-migration-blob-transfer'
import type {
  MarkovdMigrationSourceCutover,
  MarkovdMigrationSourceCutoverPhase
} from '../../shared/markovd-migration/markovd-migration-source-cutover'
import { resolveDurableMarkovdCatalogMutation } from './markovd-catalog-durable-mutation'
import { MARKOVD_MIGRATION_DESTINATION_UNSUPPORTED } from './markovd-migration-catalog-client'
import { markovdMigrationRequestFits } from './markovd-migration-manifest-export'
import {
  listMarkovdMigrationSourceCutovers,
  writeMarkovdMigrationSourceCutover
} from './markovd-migration-cutover-journal'
import type { MarkovdMigrationSourceCutoverPort } from './markovd-migration-source'
import {
  transferMarkovdMigrationSnapshots,
  type MarkovdMigrationSnapshotSource
} from './markovd-migration-snapshot-coordinator'
import {
  exportedMarkovdMigrationBlobSource,
  transferMarkovdMigrationBlobs
} from './markovd-migration-blob-coordinator'
import type { MarkovdMigrationExportedBlob } from './markovd-migration-manifest-export'
import type { MarkovdMigrationPreflightStore } from './targets/ssh-target-markovd-preflight'
import { sshRelayMigrationCutoverPort } from './markovd-migration-ssh-relay-source'
import type { SshTargetMarkovdClaims } from './targets/ssh-target-markovd-claims'

export type MarkovdMigrationDestinationCatalog = {
  readState: (manifest: MarkovdMigrationManifest) => Promise<MarkovdMigrationCatalogState>
  stage: (manifest: MarkovdMigrationManifest) => Promise<MarkovdMigrationCatalogState>
  commit: (manifest: MarkovdMigrationManifest) => Promise<MarkovdMigrationCatalogState>
  abort: (manifest: MarkovdMigrationManifest) => Promise<MarkovdMigrationCatalogAbortResult>
  /** Use identity-only abort when the journal's full manifest cannot fit a request. */
  abortByReference: (
    manifest: MarkovdMigrationCatalogReference
  ) => Promise<MarkovdMigrationCatalogReferenceAbortResult>
  stageChunk: (
    request: MarkovdMigrationSnapshotChunkRequest
  ) => Promise<MarkovdMigrationSnapshotChunkResult>
  /** Read fresh before blobs are sent: each blob kind needs its own capability. */
  readCapabilities: () => Promise<readonly string[]>
  stageBlobChunk: (
    request: MarkovdMigrationBlobChunkRequest
  ) => Promise<MarkovdMigrationBlobChunkResult>
}

export type MarkovdMigrationCutoverContext = {
  userDataPath: string
  store: MarkovdMigrationPreflightStore & MarkovdMigrationSnapshotSource
  claims: SshTargetMarkovdClaims
  destination: MarkovdMigrationDestinationCatalog
  /** Rebuild copied stores for each check so concurrent edits remain visible. */
  freshSource?: () => MarkovdMigrationPreflightStore
  /** The fenced source; defaults to the relay-era SSH target the journal names. */
  source?: MarkovdMigrationSourceCutoverPort
  now?: () => Date
}

function cutoverSource(context: MarkovdMigrationCutoverContext): MarkovdMigrationSourceCutoverPort {
  return context.source ?? sshRelayMigrationCutoverPort(context)
}

export async function stageMarkovdMigrationDestination(
  context: MarkovdMigrationCutoverContext,
  migrationId: string
): Promise<MarkovdMigrationSourceCutover> {
  let cutover = requireCutover(context.userDataPath, migrationId)
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    return cutover
  }
  const blobs = assertSourceUnchanged(context, cutover)
  const { destination } = context
  const read = await destination.readState(cutover.manifest)
  const state =
    read.state === 'committed'
      ? await confirmDurableCommit(destination, cutover.manifest)
      : await resolveDurableMarkovdCatalogMutation(
          () => destination.stage(cutover.manifest),
          () => destination.readState(cutover.manifest),
          (observed) => observed.state !== 'absent'
        )
  cutover = recordObservedState(context, cutover, state)
  if (state.state === 'staged') {
    await transferMarkovdMigrationSnapshots({
      source: context.store,
      manifest: cutover.manifest,
      state,
      destination: { readState: destination.readState, stageChunk: destination.stageChunk }
    })
    await transferMarkovdMigrationBlobs({
      source: exportedMarkovdMigrationBlobSource(blobs),
      manifest: cutover.manifest,
      blobs: blobs.map((blob) => blob.descriptor),
      destination: {
        readCapabilities: destination.readCapabilities,
        readState: destination.readState,
        stageChunk: destination.stageBlobChunk
      }
    })
  }
  return cutover
}

export async function commitMarkovdMigrationDestination(
  context: MarkovdMigrationCutoverContext,
  migrationId: string
): Promise<MarkovdMigrationSourceCutover> {
  const staged = await stageMarkovdMigrationDestination(context, migrationId)
  if (staged.phase !== 'destination-staged') {
    return staged
  }
  assertSourceUnchanged(context, staged)
  const { destination } = context
  // A lost commit reply may hide success; catalog read decides the next step.
  const state = await resolveDurableMarkovdCatalogMutation(
    () => destination.commit(staged.manifest),
    () => destination.readState(staged.manifest),
    (observed) => observed.state === 'committed'
  )
  if (state.state !== 'committed') {
    throw new Error(`markovd_migration_commit_not_committed:${state.state}`)
  }
  return recordObservedState(context, staged, state)
}

export type MarkovdMigrationAbortResult =
  | { outcome: 'released'; evidence: 'catalog-absent' | 'destination-unsupported' }
  | { outcome: 'refused'; code: string; reason: string }

/** Release only on proven destination absence; default drops journal/fence, while delta moves retain the fence. */
export async function abortMarkovdMigrationCutover(
  context: MarkovdMigrationCutoverContext,
  migrationId: string,
  release: (cutover: MarkovdMigrationSourceCutover) => Promise<void> = (cutover) =>
    cutoverSource(context).releaseFence(cutover)
): Promise<MarkovdMigrationAbortResult> {
  const cutover = requireCutover(context.userDataPath, migrationId)
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    return committedRefusal()
  }
  const { destination } = context
  // Older journals can hold oversized manifests; identity-only abort must still release them.
  if (!markovdMigrationRequestFits({ manifest: cutover.manifest })) {
    const aborted = await destination.abortByReference(cutover.manifest)
    if (aborted.state === 'committed') {
      return committedRefusal()
    }
    await release(cutover)
    return { outcome: 'released', evidence: 'catalog-absent' }
  }
  let state: MarkovdMigrationCatalogState
  try {
    state = await destination.readState(cutover.manifest)
  } catch (error) {
    // Unsupported proves absence only before any stage could have landed.
    if (isDestinationUnsupported(error) && cutover.phase === 'source-fenced') {
      await release(cutover)
      return { outcome: 'released', evidence: 'destination-unsupported' }
    }
    throw error
  }
  if (state.state !== 'committed') {
    state = await abortWithRecovery(destination, cutover.manifest)
  }
  if (state.state === 'committed') {
    recordObservedState(context, cutover, await confirmDurableCommit(destination, cutover.manifest))
    return committedRefusal()
  }
  if (state.state !== 'absent') {
    throw new Error(`markovd_migration_abort_not_absent:${state.state}`)
  }
  await release(cutover)
  return { outcome: 'released', evidence: 'catalog-absent' }
}

/** Committed reads may be unflushed memory; require the idempotent commit acknowledgement to prove durability. */
export async function confirmDurableCommit(
  destination: MarkovdMigrationDestinationCatalog,
  manifest: MarkovdMigrationManifest
): Promise<MarkovdMigrationCatalogState> {
  const state = await destination.commit(manifest)
  if (state.state !== 'committed') {
    throw new Error(`markovd_migration_commit_not_committed:${state.state}`)
  }
  return state
}

function assertSourceUnchanged(
  context: MarkovdMigrationCutoverContext,
  cutover: MarkovdMigrationSourceCutover
): MarkovdMigrationExportedBlob[] {
  return cutoverSource(context).verifyFence(cutover)
}

/** Persist observed state before returning. */
function recordObservedState(
  context: MarkovdMigrationCutoverContext,
  cutover: MarkovdMigrationSourceCutover,
  state: MarkovdMigrationCatalogState
): MarkovdMigrationSourceCutover {
  if (state.state === 'absent') {
    throw new Error('markovd_migration_destination_catalog_absent')
  }
  if (
    state.migrationId !== cutover.migrationId ||
    state.manifestSha256 !== cutover.manifestSha256
  ) {
    throw new Error('markovd_migration_destination_state_mismatch')
  }
  if (
    state.state === 'committed' &&
    (state.receipt.migrationId !== cutover.migrationId ||
      state.receipt.manifestSha256 !== cutover.manifestSha256)
  ) {
    throw new Error('markovd_migration_destination_receipt_mismatch')
  }
  const phase: MarkovdMigrationSourceCutoverPhase =
    state.state === 'committed' ? 'destination-committed' : 'destination-staged'
  if (phase === cutover.phase) {
    return cutover
  }
  if (cutover.phase === 'destination-committed' || cutover.phase === 'source-retired') {
    // Never regress a proven commit.
    return cutover
  }
  const next: MarkovdMigrationSourceCutover = {
    ...cutover,
    phase,
    updatedAt: (context.now ?? (() => new Date()))().toISOString()
  }
  writeMarkovdMigrationSourceCutover(context.userDataPath, next)
  return next
}

/** Aborts staging; a failed abort is decided by a re-read, never assumed. */
export async function abortWithRecovery(
  destination: MarkovdMigrationDestinationCatalog,
  manifest: MarkovdMigrationManifest
): Promise<MarkovdMigrationCatalogState> {
  try {
    return await destination.abort(manifest)
  } catch (abortError) {
    try {
      const observed = await destination.readState(manifest)
      if (observed.state === 'committed') {
        return observed
      }
      if (observed.state === 'absent') {
        // Absent reads may predate flush; repeat abort to prove durable absence.
        return await destination.abort(manifest)
      }
    } catch {
      // Keep the original failure and fence while abort remains unverifiable.
    }
    throw abortError
  }
}

function requireCutover(userDataPath: string, migrationId: string): MarkovdMigrationSourceCutover {
  const cutover = listMarkovdMigrationSourceCutovers(userDataPath).find(
    (entry) => entry.migrationId === migrationId
  )
  if (!cutover) {
    throw new Error('markovd_migration_source_cutover_not_found')
  }
  return cutover
}

function committedRefusal(): MarkovdMigrationAbortResult {
  return {
    outcome: 'refused',
    code: 'markovd_migration_committed_source_cannot_be_released',
    reason: 'This host’s Markov server already holds this migration; it can only move forward.'
  }
}

function isDestinationUnsupported(error: unknown): boolean {
  return error instanceof Error && error.message === MARKOVD_MIGRATION_DESTINATION_UNSUPPORTED
}
