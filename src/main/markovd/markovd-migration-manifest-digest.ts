import { createHash } from 'node:crypto'
import {
  markovdMigrationManifestHashInput,
  serializeMarkovdMigrationValue,
  type MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'

export function computeMarkovdMigrationManifestSha256(
  manifest: Omit<MarkovdMigrationManifest, 'manifestSha256'>
): string {
  return createHash('sha256').update(markovdMigrationManifestHashInput(manifest)).digest('hex')
}

/** Hash the received manifest: unknown fields from newer peers are part of its signature. */
export function assertMarkovdMigrationManifestDigest(manifest: unknown): void {
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    throw new Error('markovd_migration_manifest_invalid')
  }
  const unsigned = Object.fromEntries(
    Object.entries(manifest).filter(([key]) => key !== 'manifestSha256')
  )
  const digest = createHash('sha256').update(serializeMarkovdMigrationValue(unsigned)).digest('hex')
  if (!('manifestSha256' in manifest) || digest !== manifest.manifestSha256) {
    throw new Error('markovd_migration_manifest_digest_mismatch')
  }
}
