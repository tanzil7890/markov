import type { FolderWorkspace } from '../folder-workspaces/folder-workspace-types'
import type { Automation, AutomationRun } from '../automations-types'
import type { MarkovdMigrationManifestVersion } from './markovd-migration-manifest-validation'
import type { ProjectGroup } from '../project-group-types'
import type { Repo } from '../repo-types'
import type { SparsePreset } from '../worktree/create-types'
import type { WorkspaceLineage, WorktreeLineage } from '../worktree/lineage-types'
import type { WorktreeMeta } from '../worktree/meta-types'
import type { RetiredNameRegistry } from '../worktree/retired-name-registry'
import type { WorkspaceSessionState } from '../workspace-session/workspace-session-state-types'
import type { MarkovdMigrationClientStatePayload } from './markovd-migration-client-state'
import type {
  MarkovdMigrationSnapshotUploadState,
  MarkovdMigrationTerminalScrollbackSnapshot
} from './markovd-migration-scrollback'
import type { MarkovdMigrationBlobUploadState } from './markovd-migration-blob-transfer'

import { isRecord } from './markovd-migration-manifest-fields'

/** The relay-era SSH source: on the wire it never carries `kind` (see markovd-migration-source-kind). */
export type MarkovdMigrationSshManifestSource = {
  sshTargetId: string
  sshTargetGeneration: number | null
  targetLabel: string
}

/** Explicit desktop WSL project scope prevents destination path inference; generation orders delta moves. */
export type MarkovdMigrationLocalWslManifestSource = {
  kind: 'local-wsl'
  distro: string
  /** The distro's registry id, when known: a re-registered distro of the same name is another one. */
  distroGuid?: string
  scopeRepoIds: string[]
  scopeFolderWorkspaceIds: string[]
  generation: number
}

export type MarkovdMigrationManifestSource =
  | MarkovdMigrationSshManifestSource
  | MarkovdMigrationLocalWslManifestSource

export type MarkovdMigrationCatalogPayload = {
  repositories: Repo[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  dormantState?: MarkovdMigrationDormantStatePayload
}

export type MarkovdMigrationDormantWorktreeMeta = {
  sourceKey: string
  worktreeId: string
  meta: WorktreeMeta
}

export type MarkovdMigrationDormantWorktreeLineage = {
  sourceKey: string
  worktreeId: string
  lineage: WorktreeLineage
}

export type MarkovdMigrationDormantWorkspaceLineage = {
  sourceKey: string
  childWorkspaceKey: string
  lineage: WorkspaceLineage
}

export type MarkovdMigrationDormantRetiredNames = {
  repoId: string
  registry: RetiredNameRegistry
}

export type MarkovdMigrationDormantRetirementNamespace = {
  sourceNamespaceKeys: string[]
  namespaceKey: string
  registry: RetiredNameRegistry
}

export type MarkovdMigrationAutomationRunHistoryRef = {
  sha256: string
  byteLength: number
}

export type MarkovdMigrationDormantStatePayload = {
  version: 1
  worktreeMeta: MarkovdMigrationDormantWorktreeMeta[]
  worktreeLineage: MarkovdMigrationDormantWorktreeLineage[]
  workspaceLineage: MarkovdMigrationDormantWorkspaceLineage[]
  sparsePresets: SparsePreset[]
  retiredWorktreeNames: MarkovdMigrationDormantRetiredNames[]
  retiredWorktreeNamespaces: MarkovdMigrationDormantRetirementNamespace[]
  workspaceSession?: WorkspaceSessionState
  terminalScrollbackSnapshots?: MarkovdMigrationTerminalScrollbackSnapshot[]
  automations?: Automation[]
  /** Inline runs, as older desktops send them; never alongside `automationRunHistory`. */
  automationRuns?: AutomationRun[]
  /** Digest of the runs sent as an `automation-run-history` blob, so history never bounds the manifest. */
  automationRunHistory?: MarkovdMigrationAutomationRunHistoryRef
  /** Client-owned durable intent projected to the destination authority. */
  clientState?: MarkovdMigrationClientStatePayload
}

export type MarkovdMigrationManifest = {
  version: MarkovdMigrationManifestVersion
  migrationId: string
  createdAt: string
  source: MarkovdMigrationManifestSource
  payload: MarkovdMigrationCatalogPayload
  /** Destination runtime identity used to re-key desktop routing after commit. */
  destinationEnvironmentId?: string
  manifestSha256: string
}

export type MarkovdMigrationImportReceipt = {
  version: MarkovdMigrationManifestVersion
  migrationId: string
  manifestSha256: string
  source: MarkovdMigrationManifestSource
  importedAt: string
  repositoryIds: string[]
  projectGroupIds: string[]
  folderWorkspaceIds: string[]
}

export type MarkovdMigrationStagedCatalog = {
  version: MarkovdMigrationManifestVersion
  manifest: MarkovdMigrationManifest
  stagedAt: string
}

export type MarkovdMigrationCatalogState =
  | {
      state: 'absent'
      migrationId: string
      manifestSha256: string
    }
  | {
      state: 'staged'
      migrationId: string
      manifestSha256: string
      stagedAt: string
      snapshotUploads?: MarkovdMigrationSnapshotUploadState[]
      /** Blobs staged so far; absent from hosts without the blob channel. */
      blobUploads?: MarkovdMigrationBlobUploadState[]
    }
  | {
      state: 'committed'
      migrationId: string
      manifestSha256: string
      receipt: MarkovdMigrationImportReceipt
    }

export type MarkovdMigrationCatalogAbortResult = MarkovdMigrationCatalogState & {
  aborted: boolean
  durableAbsent?: true
}

export type MarkovdMigrationCatalogReference = Pick<
  MarkovdMigrationManifest,
  'migrationId' | 'manifestSha256'
>

/** An abort by reference: no receipt, since an evicted one is rebuilt only from the manifest. */
export type MarkovdMigrationCatalogReferenceAbortResult = MarkovdMigrationCatalogReference & {
  state: 'absent' | 'committed'
  aborted: boolean
  durableAbsent?: true
  /** The receipt was flushed before this answer; older hosts never send it. */
  durableCommitted?: true
}

export function markovdMigrationManifestHashInput(
  manifest: Omit<MarkovdMigrationManifest, 'manifestSha256'>
): string {
  return serializeMarkovdMigrationValue(manifest)
}

export function serializeMarkovdMigrationValue(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value))
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue)
  }
  if (!isRecord(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalizeJsonValue(entry)])
  )
}
