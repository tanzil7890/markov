import { insertAfterAgentExecutable } from './agent-launch/startup/agent-executable-argument-insertion'
import { findClaudeExecutableIndex } from './agent-launch/startup/agent-resume-launch-command'
import {
  quoteStartupArg,
  type AgentStartupShell
} from './agent-launch/startup/tui-agent-startup-shell'

export function withClaudeAgentViewPlugin(
  command: string,
  root: string,
  shell: AgentStartupShell
): string {
  return insertAfterAgentExecutable(
    command,
    shell,
    findClaudeExecutableIndex,
    `--plugin-dir ${quoteStartupArg(root, shell)}`
  )
}
