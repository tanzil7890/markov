// Commit receipts remain authoritative indefinitely; abandoned stages expire.
import { MAX_MARKOVD_MIGRATION_IMPORT_RECEIPTS } from '../../../shared/markovd-migration/markovd-migration-manifest-validation'
import type {
  MarkovdMigrationImportReceipt,
  MarkovdMigrationManifest
} from '../../../shared/markovd-migration/markovd-migration-manifest'
import { MAX_MARKOVD_MIGRATION_EVICTED_RECEIPTS } from '../../../shared/markovd-migration/markovd-migration-evicted-receipts'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import {
  markovdMigrationStagingKey,
  type MarkovdMigrationRequestIdentity
} from './markovd-migration-staged-file'

// Allow a week for clients that went offline mid-move.
export const MARKOVD_MIGRATION_STAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function findMarkovdMigrationImportReceipt(
  state: PersistedState,
  manifest: MarkovdMigrationManifest
): MarkovdMigrationImportReceipt | undefined {
  const receipt = state.markovdMigrationImportReceipts?.find(
    (entry) => entry.migrationId === manifest.migrationId
  )
  if (receipt) {
    return receipt
  }
  const evicted = state.markovdMigrationEvictedReceipts?.find(
    (entry) => entry.migrationId === manifest.migrationId
  )
  // Rebuild the remaining receipt fields from the manifest.
  return evicted
    ? {
        version: manifest.version,
        migrationId: evicted.migrationId,
        manifestSha256: evicted.manifestSha256,
        source: structuredClone(manifest.source),
        importedAt: evicted.importedAt,
        repositoryIds: manifest.payload.repositories.map((repo) => repo.id),
        projectGroupIds: manifest.payload.projectGroups.map((group) => group.id),
        folderWorkspaceIds: manifest.payload.folderWorkspaces.map((workspace) => workspace.id)
      }
    : undefined
}

/** Compact evicted receipts without losing proof of commit. */
export function recordMarkovdMigrationImportReceipt(
  state: PersistedState,
  receipt: MarkovdMigrationImportReceipt
): void {
  const receipts = [...(state.markovdMigrationImportReceipts ?? []), receipt]
  const overflow = receipts.length - MAX_MARKOVD_MIGRATION_IMPORT_RECEIPTS
  if (overflow > 0) {
    state.markovdMigrationEvictedReceipts = [
      ...(state.markovdMigrationEvictedReceipts ?? []),
      ...receipts.slice(0, overflow).map(({ migrationId, manifestSha256, importedAt }) => ({
        migrationId,
        manifestSha256,
        importedAt
      }))
    ].slice(-MAX_MARKOVD_MIGRATION_EVICTED_RECEIPTS)
  }
  state.markovdMigrationImportReceipts = receipts.slice(-MAX_MARKOVD_MIGRATION_IMPORT_RECEIPTS)
}

export function isLiveMarkovdMigrationStage(stagedAt: string, now: number): boolean {
  return now - Date.parse(stagedAt) < MARKOVD_MIGRATION_STAGE_TTL_MS
}

export function expireMarkovdMigrationStages(state: PersistedState, now: number): boolean {
  const staged = state.markovdMigrationStagedCatalogs ?? []
  const live = staged.filter((entry) => isLiveMarkovdMigrationStage(entry.stagedAt, now))
  if (live.length === staged.length) {
    return false
  }
  state.markovdMigrationStagedCatalogs = live
  return true
}

export type MarkovdMigrationCommitGenerationRuntime = Pick<
  StoreRuntimeState,
  'writeGeneration' | 'lastDurableWriteGeneration' | 'markovdMigrationCommitWriteGenerations'
>

/** Call right after the commit's `scheduleSave`; `generationBefore` is read just before it. */
export function recordMarkovdMigrationCommitWriteGeneration(
  runtime: MarkovdMigrationCommitGenerationRuntime,
  migration: MarkovdMigrationRequestIdentity,
  generationBefore: number
): void {
  // Suppressed saves never advance generation; only a disk-loaded receipt can prove durability.
  runtime.markovdMigrationCommitWriteGenerations.set(
    markovdMigrationStagingKey(migration),
    runtime.writeGeneration > generationBefore ? runtime.writeGeneration : Number.POSITIVE_INFINITY
  )
}

/** Require disk durability before consuming blobs a restart might need to retry. */
export function isMarkovdMigrationCommitDurable(
  runtime: MarkovdMigrationCommitGenerationRuntime,
  migration: MarkovdMigrationRequestIdentity
): boolean {
  const key = markovdMigrationStagingKey(migration)
  const required = runtime.markovdMigrationCommitWriteGenerations.get(key)
  if (required === undefined) {
    return true
  }
  if (runtime.lastDurableWriteGeneration < required) {
    return false
  }
  runtime.markovdMigrationCommitWriteGenerations.delete(key)
  return true
}
