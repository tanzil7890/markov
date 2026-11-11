import type { MarkovdTerminalCensus } from '../../../shared/markovd-terminal-census'
import type { MarkovdRollbackResult } from '../install/markovd-remote-rollback'

export function rollbackRecountRefusal(
  census: MarkovdTerminalCensus
): MarkovdRollbackResult | null {
  const live = census.liveSessions
  if (live === 0) {
    return null
  }
  return {
    outcome: 'refused',
    code:
      live === null ? 'markovd_rollback_census_unavailable' : 'markovd_rollback_terminals_running',
    reason:
      live === null
        ? 'The server did not answer how many terminals it runs. Retry when it answers.'
        : 'A terminal opened on this server before it could be stopped; close it, then retry.'
  }
}

export const ROLLBACK_STALE_COUNT: MarkovdRollbackResult = {
  outcome: 'refused',
  code: 'markovd_rollback_census_unavailable',
  reason: 'The terminal count went stale before the server could be stopped. Retry the rollback.'
}
