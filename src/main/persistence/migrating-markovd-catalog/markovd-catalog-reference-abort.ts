import type {
  MarkovdMigrationCatalogAbortResult,
  MarkovdMigrationCatalogReference,
  MarkovdMigrationCatalogReferenceAbortResult,
  MarkovdMigrationManifest
} from '../../../shared/markovd-migration/markovd-migration-manifest'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'

export function stagedManifests(state: StoreRuntimeState['state']): MarkovdMigrationManifest[] {
  return (state.markovdMigrationStagedCatalogs ?? []).map((entry) => entry.manifest)
}

export function committedMigrations(
  state: StoreRuntimeState['state']
): { migrationId: string; manifestSha256: string }[] {
  return [
    ...(state.markovdMigrationImportReceipts ?? []),
    ...(state.markovdMigrationEvictedReceipts ?? [])
  ]
}

/** Use the stored manifest; an existing commit takes precedence over abort. */
export function abortMarkovdMigrationCatalogByReference(
  state: StoreRuntimeState['state'],
  reference: MarkovdMigrationCatalogReference,
  abortStaged: (manifest: MarkovdMigrationManifest) => MarkovdMigrationCatalogAbortResult
): MarkovdMigrationCatalogReferenceAbortResult {
  const identity = { migrationId: reference.migrationId, manifestSha256: reference.manifestSha256 }
  const committed = committedMigrations(state).find(
    (entry) => entry.migrationId === reference.migrationId
  )
  const staged = stagedManifests(state).find(
    (manifest) => manifest.migrationId === reference.migrationId
  )
  const held = committed ?? staged
  if (held && held.manifestSha256 !== reference.manifestSha256) {
    throw new Error('markovd_migration_id_reused_with_different_manifest')
  }
  if (committed) {
    return { ...identity, state: 'committed', aborted: false }
  }
  if (!staged) {
    return { ...identity, state: 'absent', aborted: false }
  }
  const result = abortStaged(staged)
  return {
    ...identity,
    state: result.state === 'committed' ? 'committed' : 'absent',
    aborted: result.aborted
  }
}
