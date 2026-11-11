import type {
  MarkovdManagedPendingMigrationRow,
  MarkovdManagedRuntimeStatus
} from '../../../../../../shared/markovd-managed-runtime'
import type { MarkovdMigrationBlocker } from '../../../../../../shared/markovd-migration/markovd-migration-preflight'
import { translate } from '@/i18n/i18n'
import { MARKOVD_UPDATE_WSL_MOVE_RUNNING_CODE } from '../../../../../../shared/wsl-host-types'
import { dependencyKindLabel } from './managed-server-dependency-kinds'

export function migrationPhaseLabel(phase: MarkovdManagedPendingMigrationRow['phase']): string {
  switch (phase) {
    case 'source-fenced':
      return translate('auto.components.settings.managedServers.phase.fenced', 'Host locked')
    case 'destination-staged':
      return translate('auto.components.settings.managedServers.phase.staged', 'Copy staged')
    case 'destination-committed':
      return translate('auto.components.settings.managedServers.phase.committed', 'Copy committed')
    case 'source-retired':
      return translate('auto.components.settings.managedServers.phase.retired', 'Finished')
  }
}

export function recoveryLabel(
  recovery: NonNullable<MarkovdManagedRuntimeStatus['recovery']>
): string {
  switch (recovery.operation) {
    case 'activate':
      return translate(
        'auto.components.settings.managedServers.recovery.activate',
        'An update was interrupted'
      )
    case 'rollback':
      return translate(
        'auto.components.settings.managedServers.recovery.rollback',
        'A rollback was interrupted'
      )
    case 'decommission':
      return translate(
        'auto.components.settings.managedServers.recovery.decommission',
        'A stop was interrupted'
      )
  }
}

/** `null` counts are unknown, never zero: the server did not answer. */
export function terminalCensusLabel(terminals: MarkovdManagedRuntimeStatus['terminals']): string {
  if (terminals.liveSessions === null) {
    return translate(
      'auto.components.settings.managedServers.terminals.unknown',
      'Running terminals: unknown'
    )
  }
  return translate(
    'auto.components.settings.managedServers.terminals.count',
    'Running terminals: {{count}}',
    { count: terminals.liveSessions }
  )
}

/** Copy for Update anyway; it states only what the forced update was verified to keep. */
export function forceUpdateMessage(): string {
  return translate(
    'auto.components.settings.managedServers.row.forceUpdate',
    'Terminals are running on this host. They keep running through the update, and their panes reconnect when Markov’s server restarts.'
  )
}

export function conversionBlockerLabel(blocker: MarkovdMigrationBlocker): string {
  switch (blocker.code) {
    case 'markovd_migration_target_not_found':
      return translate(
        'auto.components.settings.managedServers.blocker.notFound',
        'The SSH host is gone.'
      )
    case 'markovd_migration_target_owned':
    case 'markovd_migration_owner_unrecorded':
      return translate(
        'auto.components.settings.managedServers.blocker.owned',
        'Markov already runs on this SSH host.'
      )
    case 'markovd_migration_direct_ssh_repositories':
    case 'markovd_migration_direct_ssh_folder_workspaces':
      return translate(
        'auto.components.settings.managedServers.blocker.catalog',
        'Projects on this host cannot move yet.'
      )
    case 'markovd_migration_direct_ssh_terminal_leases':
      return translate(
        'auto.components.settings.managedServers.blocker.terminals',
        'Terminals on this host are still running ({{count}}). Close them first.',
        { count: blocker.terminalLeases.length }
      )
    case 'markovd_migration_saved_port_forwards':
      return translate(
        'auto.components.settings.managedServers.blocker.portForwards',
        'Saved port forwards stay with the SSH host.'
      )
    case 'markovd_migration_dependent_state':
      return translate(
        'auto.components.settings.managedServers.blocker.dependents',
        'State that cannot move yet: {{kinds}}.',
        {
          kinds: blocker.dependencies
            .map((dependency) => `${dependencyKindLabel(dependency.kind)} (${dependency.count})`)
            .join(', ')
        }
      )
    case 'markovd_migration_dependency_unverifiable':
      return translate(
        'auto.components.settings.managedServers.blocker.unverifiable',
        'Markov could not read its saved {{sources}}, so it cannot tell what would move.',
        { sources: blocker.sources.map(dependencyKindLabel).join(', ') }
      )
  }
}

// Main's refusal codes, grouped by what the user does next; its English `reason` never reaches UI.
const LIVE_TERMINAL_CODES = new Set([
  'markovd_initial_runtime_live',
  'markovd_update_strands_live_terminals',
  'markovd_update_terminals_running',
  'markovd_update_ends_in_process_terminals',
  'markovd_rollback_orphans_live_terminals',
  'markovd_rollback_strands_live_terminals',
  'markovd_recovery_orphans_live_terminals',
  'markovd_stop_still_running'
])
const UNVERIFIABLE_CODES = new Set([
  'markovd_initial_runtime_unverifiable',
  'markovd_update_terminal_census_unavailable',
  'markovd_update_daemon_protocol_unverifiable',
  'markovd_rollback_active_identity_unverifiable',
  'markovd_rollback_census_unavailable',
  'markovd_rollback_daemon_protocol_unverifiable',
  'markovd_rollback_snapshot_unverifiable',
  'markovd_recovery_census_required',
  'markovd_recovery_unverifiable',
  'markovd_stop_cancel_unverifiable'
])
const MIGRATION_CODES = new Set([
  'markovd_rollback_migration_in_progress',
  'markovd_rollback_crosses_migration'
])

export function managedServerOutcomeLabel(result: {
  outcome: string
  code?: string
  verdict?: string
}): string {
  const code = result.code ?? ''
  if (code === 'markovd_stop_active_environment') {
    return translate(
      'auto.components.settings.managedServers.outcome.defaultServer',
      'Not done: this server is the default host for new projects. Choose another one under New projects open on before stopping it.'
    )
  }
  if (result.verdict === 'live' || LIVE_TERMINAL_CODES.has(code)) {
    return translate(
      'auto.components.settings.managedServers.outcome.live',
      'Not done: terminals on this server are still running. Close them and try again.'
    )
  }
  if (result.verdict === 'unverifiable' || UNVERIFIABLE_CODES.has(code)) {
    return translate(
      'auto.components.settings.managedServers.outcome.unverifiable',
      'Not done: Markov couldn’t confirm what is running on this server. Try again when the host is reachable.'
    )
  }
  if (code === MARKOVD_UPDATE_WSL_MOVE_RUNNING_CODE) {
    return translate(
      'auto.components.settings.managedServers.outcome.wslMoveRunning',
      'Not done: a project is moving onto this server. Markov updates it once the move finishes.'
    )
  }
  if (MIGRATION_CODES.has(code)) {
    return translate(
      'auto.components.settings.managedServers.outcome.migration',
      'Not done: a move onto this server is unfinished. Resume it first.'
    )
  }
  if (result.outcome === 'deferred' || result.outcome === 'pending') {
    return translate(
      'auto.components.settings.managedServers.outcome.deferred',
      'Not done yet: the server isn’t ready for this. Try again later.'
    )
  }
  return translate(
    'auto.components.settings.managedServers.outcome.failed',
    'Markov couldn’t finish this on the server. Try again.'
  )
}
