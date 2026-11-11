import { getAutomationRunRepoId } from '../../../shared/automation-run-identity'
import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import type { PersistedState } from '../../../shared/persisted-state-types'
import {
  createMarkovdMigrationSourceScope,
  markovdMigrationOwnsRepoId
} from './markovd-source-scope'

/** Include rows a downgraded build added to moved projects. */
export function subtractMarkovdMigrationSourceAutomationState(
  state: PersistedState,
  manifest: MarkovdMigrationManifest
): void {
  const scope = createMarkovdMigrationSourceScope({
    source: manifest.source,
    catalog: manifest.payload,
    repos: state.repos
  })
  const automationIds = new Set([
    ...(manifest.payload.dormantState?.automations ?? []).map((entry) => entry.id),
    ...state.automations
      .filter(
        (entry) =>
          markovdMigrationOwnsRepoId(scope, getAutomationRunRepoId(entry)) &&
          (entry.executionTargetType !== 'ssh' || entry.executionTargetId === scope.targetId)
      )
      .map((entry) => entry.id)
  ])
  const runIds = new Set((manifest.payload.dormantState?.automationRuns ?? []).map((run) => run.id))
  state.automations = state.automations.filter((entry) => !automationIds.has(entry.id))
  state.automationRuns = state.automationRuns.filter(
    (run) => !runIds.has(run.id) && !automationIds.has(run.automationId)
  )
}
