import { BrowserWindow, ipcMain, shell } from 'electron'
import { getAppEnvironment, hasAppEnvironment } from '../../shared/app-environment'
import {
  MCP_CONNECTIONS_CHANGED_CHANNEL,
  mcpConnectionDraftSchema,
  type McpConnectionActionResult,
  type McpConnectionSummary,
  type McpConnectionToolsResult
} from '../../shared/mcp-connections'
import { mcpConnectionFailureMessage } from '../mcp-gateway/mcp-connection-failure'
import { getMcpGateway } from '../mcp-gateway/mcp-gateway-installation'
import type { McpGatewayService } from '../mcp-gateway/mcp-gateway-service'
import { startMcpGateway } from '../mcp-gateway/mcp-gateway-startup'

const CHANNELS = [
  'mcpConnections:list',
  'mcpConnections:add',
  'mcpConnections:remove',
  'mcpConnections:setEnabled',
  'mcpConnections:check',
  'mcpConnections:tools',
  'mcpConnections:signIn',
  'mcpConnections:cancelSignIn',
  'mcpConnections:signOut'
] as const

let stopBroadcasting: (() => void) | null = null

function broadcastChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }
    try {
      window.webContents.send(MCP_CONNECTIONS_CHANGED_CHANNEL)
    } catch {
      // A renderer can disappear between isDestroyed() and send().
    }
  }
}

/** Runs one change and reports a failure as text the settings page can show. */
async function act(
  action: (gateway: McpGatewayService) => Promise<unknown>
): Promise<McpConnectionActionResult> {
  const gateway = getMcpGateway()
  if (!gateway) {
    return { ok: false, error: 'Connections are not available in this window.' }
  }
  try {
    await action(gateway)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function connectionId(value: unknown): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('Missing connection.')
  }
  return value
}

/** The desktop app's gateway, started on first use so it is ready before any agent launches. */
function ensureMcpGateway(): McpGatewayService | null {
  const running = getMcpGateway()
  if (running || !hasAppEnvironment()) {
    return running
  }
  const app = getAppEnvironment()
  const gateway = startMcpGateway({
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
    openExternal: (url) => shell.openExternal(url)
  })
  app.onWillQuit(() => void gateway.dispose())
  return gateway
}

export function registerMcpConnectionHandlers(): void {
  for (const channel of CHANNELS) {
    ipcMain.removeHandler(channel)
  }
  stopBroadcasting?.()
  stopBroadcasting = ensureMcpGateway()?.onChanged(broadcastChanged) ?? null

  ipcMain.handle('mcpConnections:list', async (): Promise<McpConnectionSummary[]> => {
    const gateway = getMcpGateway()
    if (!gateway) {
      return []
    }
    await gateway.ready()
    return gateway.list()
  })
  ipcMain.handle('mcpConnections:add', (_event, draft: unknown) =>
    act((gateway) => {
      const parsed = mcpConnectionDraftSchema.safeParse(draft)
      if (!parsed.success) {
        throw new Error('Some connection details are missing or not valid.')
      }
      return gateway.add(parsed.data)
    })
  )
  ipcMain.handle('mcpConnections:remove', (_event, id: unknown) =>
    act((gateway) => gateway.remove(connectionId(id)))
  )
  ipcMain.handle('mcpConnections:setEnabled', (_event, id: unknown, enabled: unknown) =>
    act((gateway) => gateway.setEnabled(connectionId(id), enabled === true))
  )
  ipcMain.handle('mcpConnections:check', (_event, id: unknown) =>
    act((gateway) => gateway.check(connectionId(id)))
  )
  ipcMain.handle(
    'mcpConnections:tools',
    async (_event, id: unknown): Promise<McpConnectionToolsResult> => {
      const gateway = getMcpGateway()
      if (!gateway) {
        return { ok: false, error: 'Connections are not available in this window.' }
      }
      try {
        return { ok: true, tools: await gateway.tools(connectionId(id)) }
      } catch (error) {
        return { ok: false, error: mcpConnectionFailureMessage(error) }
      }
    }
  )
  ipcMain.handle('mcpConnections:signIn', (_event, id: unknown) =>
    act((gateway) => gateway.signIn(connectionId(id)))
  )
  ipcMain.handle('mcpConnections:cancelSignIn', (_event, id: unknown): void => {
    getMcpGateway()?.cancelSignIn(connectionId(id))
  })
  ipcMain.handle('mcpConnections:signOut', (_event, id: unknown) =>
    act((gateway) => gateway.signOut(connectionId(id)))
  )
}
