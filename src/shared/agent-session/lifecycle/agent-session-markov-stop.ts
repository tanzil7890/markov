// The host records quit/update/crash on the cut-turn row for Continue. Unknown wire causes retain the row's words without a named cause.

export const AGENT_SESSION_MARKOV_STOP_CAUSES = ['update', 'quit', 'crash'] as const
/** The row's presentation, so a client that re-words host rows it can't name passes it through. */
export const AGENT_SESSION_MARKOV_STOP_PRESENTATION = 'markov-stop'
export type AgentSessionMarkovStopCause = (typeof AGENT_SESSION_MARKOV_STOP_CAUSES)[number]
export type AgentSessionMarkovStop = { cause: AgentSessionMarkovStopCause }

export function isAgentSessionMarkovStopCause(
  value: unknown
): value is AgentSessionMarkovStopCause {
  return AGENT_SESSION_MARKOV_STOP_CAUSES.some((cause) => cause === value)
}

/** The stop a row states, when this build knows its cause. */
export function readAgentSessionMarkovStop(value: unknown): AgentSessionMarkovStop | undefined {
  const cause =
    typeof value === 'object' && value !== null && 'cause' in value ? value.cause : undefined
  return isAgentSessionMarkovStopCause(cause) ? { cause } : undefined
}
