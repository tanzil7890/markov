// Offer "Move anyway" only when a consent-free preview shows it clears the blockers.
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import { collectMarkovdMigrationUntransferredDependencyCensus } from './markovd-source-dependency-census'
import { collectMarkovdMigrationSourceDormantState } from './markovd-source-dormant-state'
import type { MarkovdMigrationDeltaView } from './markovd-source-delta-view'

export function createMarkovdMigrationLeaveBehindView(
  runtime: Pick<StoreRuntimeState, 'state' | 'terminalScrollbackSnapshotStorage'>,
  targetId: string
): MarkovdMigrationDeltaView {
  // Read-only collectors make a shallow copy sufficient.
  const state = {
    ...runtime.state,
    sshTargets: runtime.state.sshTargets.map((target) =>
      target.id === targetId
        ? { ...target, managedServerLeaveBehind: { confirmedAt: new Date(0).toISOString() } }
        : target
    )
  }
  const storage = runtime.terminalScrollbackSnapshotStorage
  return {
    getRepos: () => state.repos,
    getFolderWorkspaces: () => state.folderWorkspaces,
    getProjectGroups: () => state.projectGroups,
    collectMarkovdMigrationSourceDormantState: (source, catalog, destinationEnvironmentId) =>
      collectMarkovdMigrationSourceDormantState(
        state,
        source,
        catalog,
        storage,
        destinationEnvironmentId
      ).payload,
    inspectMarkovdMigrationUntransferredDependencies: (manifest) =>
      collectMarkovdMigrationUntransferredDependencyCensus(state, manifest, storage)
  }
}
