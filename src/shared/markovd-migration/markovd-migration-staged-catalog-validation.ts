import type { MarkovdMigrationStagedCatalog } from './markovd-migration-manifest'
import {
  MARKOVD_MIGRATION_MANIFEST_VERSION,
  parseMarkovdMigrationManifest
} from './markovd-migration-manifest-validation'
import { isRecord } from './markovd-migration-manifest-fields'

export const MAX_MARKOVD_MIGRATION_STAGED_CATALOGS = 4

export function normalizeMarkovdMigrationStagedCatalogs(
  value: unknown
): MarkovdMigrationStagedCatalog[] {
  if (!Array.isArray(value)) {
    return []
  }
  const staged: MarkovdMigrationStagedCatalog[] = []
  const seen = new Set<string>()
  for (let index = value.length - 1; index >= 0; index--) {
    try {
      const entry = parseStagedCatalog(value[index])
      if (!seen.has(entry.manifest.migrationId)) {
        seen.add(entry.manifest.migrationId)
        staged.push(entry)
        if (staged.length === MAX_MARKOVD_MIGRATION_STAGED_CATALOGS) {
          break
        }
      }
    } catch {
      // Invalid staging cannot prove fencing; drop it fail-closed.
    }
  }
  // Keep the migration journal runnable in the documented Node 18 rollback slot.
  return staged.reduceRight<MarkovdMigrationStagedCatalog[]>((reversed, entry) => {
    reversed.push(entry)
    return reversed
  }, [])
}

function parseStagedCatalog(value: unknown): MarkovdMigrationStagedCatalog {
  if (!isRecord(value) || value.version !== MARKOVD_MIGRATION_MANIFEST_VERSION) {
    throw new Error('markovd_migration_staged_catalog_invalid')
  }
  const stagedAt = typeof value.stagedAt === 'string' ? value.stagedAt : ''
  if (!Number.isFinite(Date.parse(stagedAt))) {
    throw new Error('markovd_migration_staged_at_invalid')
  }
  return {
    version: MARKOVD_MIGRATION_MANIFEST_VERSION,
    manifest: parseMarkovdMigrationManifest(value.manifest),
    stagedAt
  }
}
