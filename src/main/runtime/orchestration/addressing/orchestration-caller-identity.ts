import type { RunRow } from '../db/orchestration-records'
import { isEquivalentPaneKey } from '../db/pane-key-match'
import { currentRunCoordinatorMarkovSessionId } from '../db/runs/run-coordinator-markov-session'
import {
  formatMarkovSessionAddress,
  type MarkovSessionId
} from '../../../../shared/markov-session-address'
import type { OrchestrationPartyIdentity as OrchestrationCallerIdentity } from '../../../../shared/orchestration-party-identity'

/** The part of a caller a Run binding stores and matches. */
export type OrchestrationCoordinatorKey = Pick<
  OrchestrationCallerIdentity,
  'terminalHandle' | 'paneKey' | 'markovSessionId'
>

/** A caller the dispatch entry resolved from the Markov session id in its injected environment. */
export type OrchestrationSessionCaller = OrchestrationCallerIdentity &
  Readonly<{
    markovSessionId: MarkovSessionId
    /** The session record the request came from. */
    sessionId: MarkovSessionId
    /** Where the session runs, from its record; `worker-start --worktree current` places here. */
    workspaceId: string
  }>

/** A caller with neither a pane nor a Markov session id can never be bound to a Run. */
export function hasRunBindingKey(caller: OrchestrationCoordinatorKey): boolean {
  return caller.paneKey !== null || caller.markovSessionId !== null
}

/** The one address a party reads mail at and is sent mail at; null for a key naming nobody. */
export function mailboxAddressOf(
  party: Pick<OrchestrationCoordinatorKey, 'terminalHandle' | 'markovSessionId'>
): string | null {
  // Workers read mail at their handles, so prefer that address when both identities exist.
  if (party.terminalHandle !== null) {
    return party.terminalHandle
  }
  return party.markovSessionId === null ? null : formatMarkovSessionAddress(party.markovSessionId)
}

/** Who a Run's binding names now; a Markov session id an older binding left behind is not part of it. */
export function runCoordinatorKey(run: RunRow): OrchestrationCoordinatorKey {
  return {
    terminalHandle: run.coordinator_handle,
    paneKey: run.coordinator_pane_key,
    markovSessionId: currentRunCoordinatorMarkovSessionId(run)
  }
}

export function runBoundToCoordinator(
  run: Pick<
    RunRow,
    | 'coordinator_pane_key'
    | 'coordinator_markov_session_id'
    | 'coordinator_markov_session_id_generation'
    | 'consumer_generation'
  >,
  caller: OrchestrationCoordinatorKey
): boolean {
  if (
    caller.paneKey !== null &&
    run.coordinator_pane_key !== null &&
    isEquivalentPaneKey(run.coordinator_pane_key, caller.paneKey)
  ) {
    return true
  }
  return (
    caller.markovSessionId !== null &&
    currentRunCoordinatorMarkovSessionId(run) === caller.markovSessionId
  )
}
