import { tokenizeStartupCommand, type AgentStartupShell } from './tui-agent-startup-shell'

/** Inserts already-quoted arguments right after the agent's executable. Returns the command
 *  unchanged unless it is a single plain invocation, so nothing is handed to a wrapper or to
 *  another command on the same line. */
export function insertAfterAgentExecutable(
  command: string,
  shell: AgentStartupShell,
  findExecutableIndex: (tokens: readonly string[], shell: AgentStartupShell) => number,
  quotedArguments: string
): string {
  const parsed = tokenizeStartupCommand(command, shell)
  if (!parsed.ok) {
    return command
  }
  const index = findExecutableIndex(parsed.tokens, shell)
  if (
    index < 0 ||
    parsed.tokens
      .slice(0, index)
      .some(
        (token, at) =>
          !(
            (shell === 'posix' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) ||
            (shell === 'powershell' && at === 0 && token === '&')
          )
      )
  ) {
    return command
  }
  for (let i = 0; i <= parsed.tokens.length; i++) {
    const start = i === 0 ? 0 : parsed.spans[i - 1].end
    const end = i === parsed.tokens.length ? command.length : parsed.spans[i].start
    if (!/^[ \t]*$/.test(command.slice(start, end))) {
      return command
    }
    if (
      i < parsed.tokens.length &&
      parsed.spans[i].divergesFromShell &&
      !(shell === 'powershell' && i === 0 && parsed.tokens[i] === '&')
    ) {
      return command
    }
  }
  const end = parsed.spans[index].end
  return `${command.slice(0, end)} ${quotedArguments}${command.slice(end)}`
}
