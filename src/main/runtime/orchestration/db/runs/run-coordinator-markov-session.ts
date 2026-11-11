import { markovSessionAddressSql } from '../markov-session-address-sql'
import type { MarkovSessionId } from '../../../../../shared/markov-session-address'
import type { RunRow } from '../orchestration-records'

type RunCoordinatorMarkovSessionFields = Pick<
  RunRow,
  | 'coordinator_markov_session_id'
  | 'coordinator_markov_session_id_generation'
  | 'consumer_generation'
>

/** Count a coordinator session id only at its stamped consumer generation; older writers bump generation without clearing it. */
export function currentRunCoordinatorMarkovSessionId(
  run: RunCoordinatorMarkovSessionFields
): MarkovSessionId | null {
  return run.coordinator_markov_session_id_generation === run.consumer_generation
    ? run.coordinator_markov_session_id
    : null
}

/** The same rule in SQL, for a `runs` row named `row` (a table name, alias, or `NEW`). */
export function currentRunCoordinatorMarkovSessionIdSql(row: string): string {
  return `(CASE WHEN ${row}.coordinator_markov_session_id_generation = ${row}.consumer_generation
    THEN ${row}.coordinator_markov_session_id END)`
}

/** The coordinator's `markov_session_id:<id>` address in SQL; NULL when it has no current Markov session id. */
export function currentRunCoordinatorSessionAddressSql(row: string): string {
  return markovSessionAddressSql(currentRunCoordinatorMarkovSessionIdSql(row))
}
