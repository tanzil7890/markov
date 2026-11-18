import { insertAfterAgentExecutable } from './agent-launch/startup/agent-executable-argument-insertion'
import {
  findClaudeExecutableIndex,
  findCodexExecutableIndex
} from './agent-launch/startup/agent-resume-launch-command'
import {
  quoteStartupArg,
  type AgentStartupShell
} from './agent-launch/startup/tui-agent-startup-shell'

/** The MCP server name agents see; their tool names begin `mcp__markov__`. */
export const MCP_GATEWAY_SERVER_NAME = 'markov'

/** How an agent starts the gateway: Markov's own CLI, pointed at this app's data folder. */
export type McpGatewayServerLaunch = {
  command: string
  args: string[]
  env: Record<string, string>
}

/** The content of the file handed to Claude Code with `--mcp-config=`. */
export function claudeMcpGatewayConfig(launch: McpGatewayServerLaunch): {
  mcpServers: Record<string, McpGatewayServerLaunch>
} {
  return { mcpServers: { [MCP_GATEWAY_SERVER_NAME]: launch } }
}

function tomlLiteral(value: string): string | null {
  // Literal strings take no escapes, which keeps double quotes out of Windows command lines.
  return /['\r\n]/.test(value) ? null : `'${value}'`
}

/** The `-c` value that adds the gateway to Codex beside the person's own servers, or null when a
 *  path cannot be written as a TOML literal. */
export function codexMcpGatewayConfigOverride(launch: McpGatewayServerLaunch): string | null {
  const command = tomlLiteral(launch.command)
  const args = launch.args.map(tomlLiteral)
  const env = Object.entries(launch.env).map(([name, value]) => {
    const literal = tomlLiteral(value)
    return literal && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? `${name}=${literal}` : null
  })
  if (!command || args.includes(null) || env.includes(null)) {
    return null
  }
  return `mcp_servers.${MCP_GATEWAY_SERVER_NAME}={command=${command},args=[${args.join(',')}],env={${env.join(',')}}}`
}

export type AgentMcpGatewayLaunchArguments = {
  /** A file holding `claudeMcpGatewayConfig`; it must exist, or Claude Code refuses to start. */
  claudeConfigPath: string
  codexConfigOverride: string | null
}

/** Adds the gateway to a Claude Code or Codex terminal command; any other command is returned as is. */
export function withAgentMcpGateway(
  command: string,
  shell: AgentStartupShell,
  launch: AgentMcpGatewayLaunchArguments
): string {
  // Why `=`: `--mcp-config` takes several values, so a following prompt would be read as a file.
  const claudeArgument = `--mcp-config=${launch.claudeConfigPath}`
  if (command.includes(claudeArgument) || command.includes('mcp_servers')) {
    return command
  }
  const withClaude = insertAfterAgentExecutable(
    command,
    shell,
    findClaudeExecutableIndex,
    quoteStartupArg(claudeArgument, shell)
  )
  if (withClaude !== command || !launch.codexConfigOverride) {
    return withClaude
  }
  return insertAfterAgentExecutable(
    command,
    shell,
    findCodexExecutableIndex,
    `-c ${quoteStartupArg(launch.codexConfigOverride, shell)}`
  )
}
