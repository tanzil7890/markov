import { MARKOV_AGENT_SESSION_ID_ENV } from '../../../../shared/agent-session/lifecycle/agent-session-caller-env'
import { MARKOV_STRUCTURED_SESSION_ENV } from '../../../../shared/structured-session-marker'

export const AGENT_HOOK_RUNTIME_ENV_KEYS = [
  'MARKOV_AGENT_HOOK_PORT',
  'MARKOV_AGENT_HOOK_TOKEN',
  'MARKOV_AGENT_HOOK_ENV',
  'MARKOV_AGENT_HOOK_VERSION',
  'MARKOV_AGENT_HOOK_TRANSPORT',
  'MARKOV_AGENT_HOOK_ENDPOINT',
  // Remove the reverted inherited path still present in older PTYs (#2778).
  'MARKOV_CLAUDE_AGENT_STATUS_SETTINGS'
] as const

// Inherited Claude child stamps make an independent pane act as the launching session's child.
export const CLAUDE_CHILD_SESSION_STAMP_ENV_KEYS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_ENTRYPOINT'
] as const

// Inherited structured-session IDs would make every pane claim the parent orchestration caller.
export const MARKOV_AGENT_SESSION_CALLER_ENV_KEYS = [
  MARKOV_AGENT_SESSION_ID_ENV,
  MARKOV_STRUCTURED_SESSION_ENV
] as const
