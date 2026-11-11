import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { subtractMarkovdSourceWorktreeMetadata } from './markovd-source-worktree-metadata'
import { subtractMarkovdMigrationSourceAutomationState } from './markovd-source-automation-subtraction'
import { subtractMarkovdMigrationSourceWorkspaceSession } from './markovd-source-workspace-session-subtraction'
import { subtractMarkovdMigrationClientState } from './markovd-source-client-subtraction'

/** Mutate a delta-view copy only. */
export function subtractMarkovdMigrationSourceDormantState(
  state: PersistedState,
  manifest: MarkovdMigrationManifest
): void {
  // Include state a downgraded build added even when the manifest had none.
  subtractMarkovdSourceWorktreeMetadata(state, manifest)
  subtractMarkovdMigrationSourceAutomationState(state, manifest)
  const dormant = manifest.payload.dormantState
  if (!dormant) {
    return
  }
  dormant.worktreeLineage.forEach((entry) => delete state.worktreeLineageById[entry.sourceKey])
  dormant.workspaceLineage.forEach(
    (entry) => delete state.workspaceLineageByChildKey[entry.sourceKey]
  )
  for (const preset of dormant.sparsePresets) {
    const remaining = (state.sparsePresetsByRepo[preset.repoId] ?? []).filter(
      (entry) => entry.id !== preset.id
    )
    if (remaining.length > 0) {
      state.sparsePresetsByRepo[preset.repoId] = remaining
    } else {
      delete state.sparsePresetsByRepo[preset.repoId]
    }
  }
  for (const entry of dormant.retiredWorktreeNames) {
    delete state.retiredWorktreeNamesByRepo?.[entry.repoId]
  }
  subtractMarkovdMigrationSourceWorkspaceSession(state, manifest)
  subtractMarkovdMigrationClientState(state, manifest)
  // Retain snapshot files: the prior durable profile and rollback evidence can still reference them.
}
