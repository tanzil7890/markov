import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import {
  MARKOVD_MIGRATION_DEPENDENCY_KINDS,
  type MarkovdMigrationDependencyKind
} from '../../../shared/markovd-migration/markovd-migration-preflight'
import type { PersistedState } from '../../../shared/persisted-state-types'
import type { TerminalScrollbackSnapshotStorage } from '../../pty/scrollback/terminal-scrollback-snapshots'
import {
  inspectMarkovdMigrationSourceSessions,
  type MarkovdMigrationSourceSessionInspection
} from './markovd-source-session-dependencies'
import {
  collectMarkovdMigrationSourceDormantState,
  markovdMigrationLeavesBehind
} from './markovd-source-dormant-state'
import {
  createMarkovdMigrationSourceScope,
  markovdMigrationOwnerMatchesScope,
  markovdMigrationPartitionScope,
  type MarkovdMigrationSourceScope
} from './markovd-source-scope'
import { paneBelongsToTabs } from '../../../shared/workspace-session/workspace-session-pane-ownership'

export type MarkovdMigrationSourceDependencyCensus = {
  totalCount: number
  counts: Record<MarkovdMigrationDependencyKind, number>
  /** Blocker names and remedies where available. */
  names?: Partial<Record<MarkovdMigrationDependencyKind, string[]>>
}

export function collectMarkovdMigrationUntransferredDependencyCensus(
  state: PersistedState,
  manifest: MarkovdMigrationManifest,
  storage?: TerminalScrollbackSnapshotStorage
): MarkovdMigrationSourceDependencyCensus {
  const scope = createMarkovdMigrationSourceScope({
    source: manifest.source,
    catalog: manifest.payload,
    repos: state.repos
  })
  const sessions = inspectMarkovdMigrationSourceSessions(state, {
    hostId: scope.hostId,
    ownerMatches: (ownerKey, partitionHostId) =>
      markovdMigrationOwnerMatchesScope(
        ownerKey,
        markovdMigrationPartitionScope(scope, partitionHostId)
      )
  })
  const dormant = collectMarkovdMigrationSourceDormantState(
    state,
    manifest.source,
    manifest.payload,
    storage,
    manifest.destinationEnvironmentId
  )
  const counts: Record<MarkovdMigrationDependencyKind, number> = {
    ...dormant.blockedCounts,
    'terminal-lease': state.sshRemotePtyLeases.filter(
      (lease) => lease.targetId === scope.targetId && lease.state !== 'terminated'
    ).length,
    // Retained recoveries can stay behind; the terminal gate still requires exit.
    'terminal-recovery': markovdMigrationLeavesBehind(state, scope.targetId)
      ? 0
      : countTerminalRecoveryState(state, scope, sessions)
  }
  return {
    counts,
    totalCount: MARKOVD_MIGRATION_DEPENDENCY_KINDS.reduce((total, kind) => total + counts[kind], 0),
    names: {
      ...(dormant.blockedSessionItems.length > 0
        ? { 'workspace-session': dormant.blockedSessionItems }
        : {}),
      ...(dormant.runningAutomationItems.length > 0
        ? { 'automation-run': dormant.runningAutomationItems }
        : {})
    }
  }
}

// The terminal gate proves recovery leases exited; hook aliases add no independent terminal ownership.
function countTerminalRecoveryState(
  state: PersistedState,
  scope: MarkovdMigrationSourceScope,
  sessions: MarkovdMigrationSourceSessionInspection
): number {
  return state.migrationUnsupportedPtyEntries.filter(
    (entry) =>
      markovdMigrationOwnerMatchesScope(entry.worktreeId, scope) ||
      (entry.tabId ? sessions.tabIds.has(entry.tabId) : false) ||
      sessions.ptyIds.has(entry.ptyId) ||
      (entry.paneKey ? paneBelongsToTabs(entry.paneKey, sessions.tabIds) : false)
  ).length
}
