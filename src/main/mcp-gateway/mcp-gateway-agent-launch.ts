import { access, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  MCP_GATEWAY_SERVER_NAME,
  claudeMcpGatewayConfig,
  codexMcpGatewayConfigOverride,
  withAgentMcpGateway,
  type McpGatewayServerLaunch
} from '../../shared/agent-mcp-gateway-launch'
import type { AgentStartupShell } from '../../shared/agent-launch/startup/tui-agent-startup-shell'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import { prependMarkovCliDirToChildPath } from '../cli/markov-cli-child-path'
import { durableWriteTempPath, writeFileDurable } from '../filesystem/durable-file-write'
import { getMcpGateway } from './mcp-gateway-installation'
import { mcpGatewayDataDirectory } from './mcp-gateway-data-directory'

/** How an agent on this machine starts the gateway, or null when there is nothing to offer it:
 *  no gateway on this host, no connection switched on, or no CLI to run. */
export async function resolveMcpGatewayServerLaunch(): Promise<McpGatewayServerLaunch | null> {
  const gateway = getMcpGateway()
  if (!gateway || !hasAppEnvironment()) {
    return null
  }
  await gateway.ready().catch(() => undefined)
  if (!gateway.hasActiveConnections()) {
    return null
  }
  const app = getAppEnvironment()
  const userDataPath = app.getPath('userData')
  const command = prependMarkovCliDirToChildPath(
    {},
    { isPackaged: app.isPackaged(), userDataPath, resourcesPath: process.resourcesPath ?? null }
  )
  if (!command || !(await exists(command))) {
    return null
  }
  return { command, args: ['mcp', 'serve'], env: { MARKOV_USER_DATA_PATH: userDataPath } }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false
  )
}

/** Claude Code refuses to start on a missing or malformed config, so the file is checked first. */
async function ensureClaudeConfigFile(launch: McpGatewayServerLaunch): Promise<string | null> {
  const path = join(
    mcpGatewayDataDirectory(getAppEnvironment().getPath('userData')),
    'claude-mcp-config.json'
  )
  const content = JSON.stringify(claudeMcpGatewayConfig(launch), null, 2)
  try {
    if ((await readFile(path, 'utf8').catch(() => null)) !== content) {
      await mkdir(dirname(path), { recursive: true })
      await writeFileDurable(durableWriteTempPath(path), path, content)
    }
    return path
  } catch {
    return null
  }
}

/** Adds the gateway to a Claude Code or Codex terminal command that runs on this machine. */
export async function withMcpGatewayServer(
  command: string | undefined,
  shell: AgentStartupShell
): Promise<string | undefined> {
  if (!command) {
    return command
  }
  try {
    const launch = await resolveMcpGatewayServerLaunch()
    const claudeConfigPath = launch && (await ensureClaudeConfigFile(launch))
    if (!launch || !claudeConfigPath) {
      return command
    }
    return withAgentMcpGateway(command, shell, {
      claudeConfigPath,
      codexConfigOverride: codexMcpGatewayConfigOverride(launch)
    })
  } catch {
    // An agent must always start; connections are an extra.
    return command
  }
}

/** The `mcpServers` entry for a Claude chat session, or null when there is nothing to offer. */
export async function mcpGatewayServersForClaudeChat(): Promise<Record<
  string,
  McpGatewayServerLaunch
> | null> {
  const launch = await resolveMcpGatewayServerLaunch().catch(() => null)
  return launch ? { [MCP_GATEWAY_SERVER_NAME]: launch } : null
}

/** `codex … app-server` arguments with the gateway added ahead of the subcommand. */
export async function withMcpGatewayForCodexChat(args: readonly string[]): Promise<string[]> {
  const launch = await resolveMcpGatewayServerLaunch().catch(() => null)
  const override = launch && codexMcpGatewayConfigOverride(launch)
  const subcommand = args.lastIndexOf('app-server')
  if (!override || subcommand === -1 || args.some((arg) => arg.includes('mcp_servers'))) {
    return [...args]
  }
  return [...args.slice(0, subcommand), '-c', override, ...args.slice(subcommand)]
}
