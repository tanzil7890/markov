import {
  markovdMigrationAutomationRunHistoryBlob,
  withMarkovdMigrationAutomationRunHistory
} from '../../../shared/markovd-migration/markovd-migration-automation-run-history'
import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { readMarkovdMigrationBlob } from './markovd-migration-blob-staging'

/** The manifest signs the history's digest, so its rows import with the catalog or not at all. */
export function withStagedAutomationRunHistory(
  manifest: MarkovdMigrationManifest,
  blobRoot: string
): MarkovdMigrationManifest {
  const ref = manifest.payload.dormantState?.automationRunHistory
  if (!ref) {
    return manifest
  }
  const descriptor = markovdMigrationAutomationRunHistoryBlob(ref)
  return withMarkovdMigrationAutomationRunHistory(
    manifest,
    readMarkovdMigrationBlob(manifest, blobRoot, descriptor).toString('utf8')
  )
}
