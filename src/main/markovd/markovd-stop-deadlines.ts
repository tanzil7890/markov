// Keep imports dependency-free for short-lived stop-completion commands.
export const MARKOVD_SHUTDOWN_DEADLINE_MS = 15_000
export const MARKOVD_DAEMON_RETIREMENT_TIMEOUT_MS = 5_000

export const MARKOVD_STOP_COMPLETION_POLL_MS = 250
// Retirement precedes the shutdown deadline; budget for both plus polling slack.
const STOP_COMPLETION_BUDGET_MS =
  2 * MARKOVD_DAEMON_RETIREMENT_TIMEOUT_MS + MARKOVD_SHUTDOWN_DEADLINE_MS + 5_000
export const MARKOVD_STOP_COMPLETION_POLL_ATTEMPTS = Math.ceil(
  STOP_COMPLETION_BUDGET_MS / MARKOVD_STOP_COMPLETION_POLL_MS
)
