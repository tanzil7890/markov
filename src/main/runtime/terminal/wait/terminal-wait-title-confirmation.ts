import type { RuntimeTerminalAgentStatusSnapshot } from '../query/runtime-terminal-agent-status-query'
import { detectExplicitIdleStatusFromTitle } from './terminal-wait-detection'

export function hasConfirmedNonPermissionTitle(
  terminal: RuntimeTerminalAgentStatusSnapshot
): boolean {
  return (
    terminal.titleStatusIsLive &&
    (terminal.titleStatus === 'working' ||
      detectExplicitIdleStatusFromTitle(terminal.title ?? '') === 'idle')
  )
}
