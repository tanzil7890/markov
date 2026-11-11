import { MAX_MARKOVD_MIGRATION_STAGED_CATALOGS } from '../../../shared/markovd-migration/markovd-migration-staged-catalog-validation'
import { MARKOVD_MIGRATION_MANIFEST_VERSION } from '../../../shared/markovd-migration/markovd-migration-manifest-validation'
import type {
  MarkovdMigrationCatalogAbortResult,
  MarkovdMigrationCatalogReference,
  MarkovdMigrationCatalogReferenceAbortResult,
  MarkovdMigrationCatalogState,
  MarkovdMigrationImportReceipt,
  MarkovdMigrationManifest
} from '../../../shared/markovd-migration/markovd-migration-manifest'
import type {
  MarkovdMigrationSnapshotChunkRequest,
  MarkovdMigrationSnapshotChunkResult
} from '../../../shared/markovd-migration/markovd-migration-scrollback'
import type {
  MarkovdMigrationBlobChunkRequest,
  MarkovdMigrationBlobChunkResult,
  MarkovdMigrationBlobDescriptor
} from '../../../shared/markovd-migration/markovd-migration-blob-transfer'
import type { RepoLifecycleOperations } from '../loading-store/repo-lifecycle-operations'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import type { WriteSchedulingOperations } from '../loading-store/write-scheduling'
import { scheduleSave } from '../loading-store/write-scheduling'
import {
  applyPreparedMarkovdMigrationCatalog,
  prepareMarkovdMigrationCatalog,
  type PreparedMarkovdMigrationCatalog
} from './markovd-catalog-records'
import {
  expireMarkovdMigrationStages,
  isLiveMarkovdMigrationStage,
  recordMarkovdMigrationCommitWriteGeneration,
  recordMarkovdMigrationImportReceipt,
  type MarkovdMigrationCommitGenerationRuntime
} from './markovd-catalog-receipt-ledger'
import {
  abortMarkovdMigrationSnapshots,
  assertMarkovdMigrationSnapshotsReady,
  commitMarkovdMigrationSnapshots,
  pruneMarkovdMigrationSnapshotStaging,
  stageMarkovdMigrationSnapshotChunk
} from './markovd-scrollback-snapshot-transfer'
import {
  abortMarkovdMigrationBlobs,
  assertMarkovdMigrationBlobSetMatches,
  assertMarkovdMigrationBlobsReady,
  commitMarkovdMigrationBlobs,
  pruneMarkovdMigrationBlobStaging,
  stageMarkovdMigrationBlobChunk
} from './markovd-migration-blob-staging'
import { withStagedAutomationRunHistory } from './markovd-staged-automation-run-history'
import { assertMarkovdMigrationBlobContentsValid } from './markovd-migration-blob-installers'
import {
  abortMarkovdMigrationCatalogByReference,
  committedMigrations,
  stagedManifests
} from './markovd-catalog-reference-abort'
import {
  absentCatalogState,
  committedCatalogState,
  migrationCatalogState,
  stagedCatalogState
} from './markovd-catalog-state'

type MarkovdCatalogImportRuntime = MarkovdMigrationCommitGenerationRuntime &
  Pick<
    StoreRuntimeState,
    'state' | 'terminalScrollbackSnapshotStorage' | 'markovdMigrationBlobRoot'
  >

const markovdCatalogImportContext = Symbol('MarkovdCatalogImportPersistence')
type MarkovdCatalogImportContext = {
  runtime: MarkovdCatalogImportRuntime
  repos: RepoLifecycleOperations
  scheduling: WriteSchedulingOperations
}

// Manifests arrive parsed; the RPC boundary verified the digest over the bytes as sent.
export class MarkovdCatalogImportPersistence {
  readonly [markovdCatalogImportContext]: MarkovdCatalogImportContext

  constructor(
    runtime: MarkovdCatalogImportRuntime,
    repos: RepoLifecycleOperations,
    scheduling: WriteSchedulingOperations
  ) {
    this[markovdCatalogImportContext] = { runtime, repos, scheduling }
  }

  stageMarkovdMigrationCatalog(
    manifest: MarkovdMigrationManifest,
    options: { now?: () => Date } = {}
  ): MarkovdMigrationCatalogState {
    const context = this[markovdCatalogImportContext]
    const now = options.now ?? (() => new Date())
    if (expireMarkovdMigrationStages(context.runtime.state, now().getTime())) {
      scheduleSave(context.scheduling)
    }
    pruneMarkovdMigrationSnapshotStaging(
      stagedManifests(context.runtime.state),
      context.runtime.terminalScrollbackSnapshotStorage
    )
    pruneMarkovdMigrationBlobStaging(
      stagedManifests(context.runtime.state),
      committedMigrations(context.runtime.state),
      context.runtime.markovdMigrationBlobRoot
    )
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed') {
      return current
    }
    prepareMarkovdMigrationCatalog(manifest, context.runtime.state)
    if (current.state === 'staged') {
      return current
    }
    const staged = context.runtime.state.markovdMigrationStagedCatalogs ?? []
    if (staged.length >= MAX_MARKOVD_MIGRATION_STAGED_CATALOGS) {
      throw new Error('markovd_migration_staging_capacity_exceeded')
    }
    const stagedAt = now().toISOString()
    context.runtime.state.markovdMigrationStagedCatalogs = [
      ...staged,
      {
        version: MARKOVD_MIGRATION_MANIFEST_VERSION,
        manifest: structuredClone(manifest),
        stagedAt
      }
    ]
    scheduleSave(context.scheduling)
    return stagedCatalogState(manifest, stagedAt, context.runtime)
  }

  stageMarkovdMigrationSnapshotChunk(
    request: MarkovdMigrationSnapshotChunkRequest
  ): MarkovdMigrationSnapshotChunkResult {
    const context = this[markovdCatalogImportContext]
    return stageMarkovdMigrationSnapshotChunk({
      stagedManifest:
        stagedManifests(context.runtime.state).find(
          (manifest) => manifest.migrationId === request.migrationId
        ) ?? null,
      storage: context.runtime.terminalScrollbackSnapshotStorage,
      request
    })
  }

  stageMarkovdMigrationBlobChunk(
    request: MarkovdMigrationBlobChunkRequest
  ): MarkovdMigrationBlobChunkResult {
    const context = this[markovdCatalogImportContext]
    return stageMarkovdMigrationBlobChunk({
      stagedManifest:
        stagedManifests(context.runtime.state).find(
          (manifest) => manifest.migrationId === request.migrationId
        ) ?? null,
      root: context.runtime.markovdMigrationBlobRoot,
      request
    })
  }

  /** Omitted expectedBlobs preserves older senders' commit behavior. */
  commitStagedMarkovdMigrationCatalog(
    manifest: MarkovdMigrationManifest,
    options: { now?: () => Date; expectedBlobs?: readonly MarkovdMigrationBlobDescriptor[] } = {}
  ): MarkovdMigrationCatalogState {
    const context = this[markovdCatalogImportContext]
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed') {
      return current
    }
    if (current.state !== 'staged') {
      throw new Error('markovd_migration_catalog_not_staged')
    }
    const blobRoot = context.runtime.markovdMigrationBlobRoot
    assertMarkovdMigrationSnapshotsReady(
      manifest,
      context.runtime.terminalScrollbackSnapshotStorage
    )
    if (options.expectedBlobs) {
      assertMarkovdMigrationBlobSetMatches(manifest, blobRoot, options.expectedBlobs)
    }
    assertMarkovdMigrationBlobsReady(manifest, blobRoot)
    assertMarkovdMigrationBlobContentsValid(manifest, blobRoot)
    const prepared = prepareMarkovdMigrationCatalog(
      withStagedAutomationRunHistory(manifest, blobRoot),
      context.runtime.state
    )
    commitMarkovdMigrationSnapshots(manifest, context.runtime.terminalScrollbackSnapshotStorage)
    commitMarkovdMigrationBlobs(manifest, blobRoot)
    const receipt = commitPreparedCatalog(context, manifest, prepared, options.now)
    const generationBefore = context.runtime.writeGeneration
    scheduleSave(context.scheduling)
    recordMarkovdMigrationCommitWriteGeneration(context.runtime, manifest, generationBefore)
    return committedCatalogState(receipt)
  }

  abortStagedMarkovdMigrationCatalog(
    manifest: MarkovdMigrationManifest
  ): MarkovdMigrationCatalogAbortResult {
    const context = this[markovdCatalogImportContext]
    const current = migrationCatalogState(context.runtime, manifest)
    if (current.state === 'committed' || current.state === 'absent') {
      return { ...current, aborted: false }
    }
    // Staged rows are dormant and unreferenced outside this stage.
    context.runtime.state.markovdMigrationStagedCatalogs = (
      context.runtime.state.markovdMigrationStagedCatalogs ?? []
    ).filter((entry) => entry.manifest.migrationId !== manifest.migrationId)
    abortMarkovdMigrationSnapshots(manifest, context.runtime.terminalScrollbackSnapshotStorage)
    abortMarkovdMigrationBlobs(manifest, context.runtime.markovdMigrationBlobRoot)
    scheduleSave(context.scheduling)
    return { ...absentCatalogState(manifest), aborted: true }
  }

  /** Use the stored manifest when the source cannot send one. */
  abortStagedMarkovdMigrationCatalogByReference(
    reference: MarkovdMigrationCatalogReference
  ): MarkovdMigrationCatalogReferenceAbortResult {
    return abortMarkovdMigrationCatalogByReference(
      this[markovdCatalogImportContext].runtime.state,
      reference,
      (manifest) => this.abortStagedMarkovdMigrationCatalog(manifest)
    )
  }

  getMarkovdMigrationCatalogState(
    manifest: MarkovdMigrationManifest
  ): MarkovdMigrationCatalogState {
    const context = this[markovdCatalogImportContext]
    return migrationCatalogState(context.runtime, manifest)
  }

  hasStagedMarkovdMigrationCatalog(now: number = Date.now()): boolean {
    return (
      this[markovdCatalogImportContext].runtime.state.markovdMigrationStagedCatalogs ?? []
    ).some((entry) => isLiveMarkovdMigrationStage(entry.stagedAt, now))
  }
}

function commitPreparedCatalog(
  context: MarkovdCatalogImportContext,
  manifest: MarkovdMigrationManifest,
  prepared: PreparedMarkovdMigrationCatalog,
  now?: () => Date
): MarkovdMigrationImportReceipt {
  applyPreparedMarkovdMigrationCatalog(prepared, context.runtime.state, context.repos)
  const receipt: MarkovdMigrationImportReceipt = {
    version: MARKOVD_MIGRATION_MANIFEST_VERSION,
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256,
    source: structuredClone(manifest.source),
    importedAt: (now ?? (() => new Date()))().toISOString(),
    repositoryIds: prepared.repositories.map((repo) => repo.id),
    projectGroupIds: prepared.projectGroups.map((group) => group.id),
    folderWorkspaceIds: prepared.folderWorkspaces.map((workspace) => workspace.id)
  }
  context.runtime.state.markovdMigrationStagedCatalogs = (
    context.runtime.state.markovdMigrationStagedCatalogs ?? []
  ).filter((entry) => entry.manifest.migrationId !== manifest.migrationId)
  recordMarkovdMigrationImportReceipt(context.runtime.state, receipt)
  return receipt
}
