/** Finished automation runs travel as one blob; the signed manifest carries only its digest, so run
 * history never bounds the manifest. Format changes require a new capability. */
import type { AutomationRun } from '../automations-types'
import type { MarkovdMigrationBlobDescriptor } from './markovd-migration-blob-transfer'
import {
  serializeMarkovdMigrationValue,
  type MarkovdMigrationAutomationRunHistoryRef,
  type MarkovdMigrationManifest
} from './markovd-migration-manifest'
import { parseMarkovdMigrationCatalogPayload } from './markovd-migration-manifest-validation'
import { requiredRecord } from './markovd-migration-dormant-value-validation'

const MARKOVD_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION = 1

/** Canonical, so a re-export of an unchanged source reproduces the journaled digest. */
export function serializeMarkovdMigrationAutomationRunHistory(
  runs: readonly AutomationRun[]
): string {
  return serializeMarkovdMigrationValue({
    version: MARKOVD_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION,
    runs
  })
}

export function markovdMigrationAutomationRunHistoryBlob(
  ref: MarkovdMigrationAutomationRunHistoryRef
): MarkovdMigrationBlobDescriptor {
  return { blobKind: 'automation-run-history', key: 'migration', ...ref }
}

/** Blobs the manifest itself names; its commit is refused until they are staged. */
export function markovdMigrationManifestBlobs(
  manifest: Pick<MarkovdMigrationManifest, 'payload'>
): MarkovdMigrationBlobDescriptor[] {
  const ref = manifest.payload.dormantState?.automationRunHistory
  return ref ? [markovdMigrationAutomationRunHistoryBlob(ref)] : []
}

/** The manifest with its runs inline, validated against its own catalog as inline runs would be. */
export function withMarkovdMigrationAutomationRunHistory<
  T extends Pick<MarkovdMigrationManifest, 'payload'>
>(manifest: T, text: string): T {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Error('markovd_migration_automation_run_history_invalid')
  }
  const record = requiredRecord(document, 'markovd_migration_automation_run_history_invalid')
  if (record.version !== MARKOVD_MIGRATION_AUTOMATION_RUN_HISTORY_VERSION) {
    throw new Error('markovd_migration_automation_run_history_version_unsupported')
  }
  const { automationRunHistory: _ref, ...dormantState } = manifest.payload.dormantState ?? {}
  return {
    ...manifest,
    payload: parseMarkovdMigrationCatalogPayload({
      ...manifest.payload,
      dormantState: { ...dormantState, automationRuns: record.runs }
    })
  }
}
