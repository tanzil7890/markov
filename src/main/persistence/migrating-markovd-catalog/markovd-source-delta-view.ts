// Export only additions from older builds by subtracting prior migrations from a profile copy.
import type {
  MarkovdMigrationCatalogPayload,
  MarkovdMigrationDormantStatePayload,
  MarkovdMigrationManifest,
  MarkovdMigrationManifestSource
} from '../../../shared/markovd-migration/markovd-migration-manifest'
import type { FolderWorkspace } from '../../../shared/folder-workspaces/folder-workspace-types'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import { subtractMarkovdSourceCatalogState } from './markovd-source-catalog-subtraction'
import {
  collectMarkovdMigrationUntransferredDependencyCensus,
  type MarkovdMigrationSourceDependencyCensus
} from './markovd-source-dependency-census'
import { subtractMarkovdMigrationSourceDormantState } from './markovd-source-dormant-subtraction'
import { collectMarkovdMigrationSourceDormantState } from './markovd-source-dormant-state'
import { subtractMarkovdMigrationScopeWorkspaceSession } from './markovd-source-workspace-session-subtraction'

export type MarkovdMigrationDeltaView = {
  getRepos: () => Repo[]
  getFolderWorkspaces: () => FolderWorkspace[]
  getProjectGroups: () => ProjectGroup[]
  collectMarkovdMigrationSourceDormantState: (
    source: MarkovdMigrationManifestSource,
    catalog: MarkovdMigrationCatalogPayload,
    destinationEnvironmentId?: string
  ) => MarkovdMigrationDormantStatePayload
  inspectMarkovdMigrationUntransferredDependencies: (
    manifest: MarkovdMigrationManifest
  ) => MarkovdMigrationSourceDependencyCensus
}

/** moved includes today's edits to previously migrated rows. */
export function createMarkovdMigrationDeltaView(
  runtime: Pick<StoreRuntimeState, 'state' | 'terminalScrollbackSnapshotStorage'>,
  moved: MarkovdMigrationManifest
): MarkovdMigrationDeltaView {
  const state = structuredClone(runtime.state)
  subtractMarkovdSourceCatalogState(state, moved)
  subtractMarkovdMigrationSourceDormantState(state, moved)
  // The server owns the moved projects' tabs now, even ones the older build left unmovable.
  subtractMarkovdMigrationScopeWorkspaceSession(state, moved)
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
