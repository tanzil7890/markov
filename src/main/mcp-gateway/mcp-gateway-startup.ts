import { join } from 'node:path'
import { resolveCommandOnLocalPath } from '../ipc/command-path/command-path-resolver'
import { getMainHttpClient } from '../network/http-client'
import { McpConnectionSecretVault } from './mcp-connection-secret-vault'
import { McpConnectionStore } from './mcp-connection-store'
import { installMcpGateway } from './mcp-gateway-installation'
import { McpGatewayService } from './mcp-gateway-service'
import { mcpGatewayDataDirectory } from './mcp-gateway-data-directory'
import { McpOAuthAccess } from './mcp-oauth-access'
import { signInToMcpConnection } from './mcp-oauth-sign-in'
import type { McpHttpFetch } from './mcp-streamable-http-transport'
import { McpUpstreamPool } from './mcp-upstream-pool'

export type McpGatewayStartupOptions = {
  userDataPath: string
  appVersion: string
  openExternal: (url: string) => Promise<void>
}

/** Builds this host's gateway, installs it for the RPC layer, and starts loading saved connections. */
export function startMcpGateway(options: McpGatewayStartupOptions): McpGatewayService {
  const directory = mcpGatewayDataDirectory(options.userDataPath)
  const vault = new McpConnectionSecretVault(join(directory, 'secrets.json.enc'))
  // Resolved per request: the HTTP client is replaced once Chromium's proxy session is ready.
  const fetcher: McpHttpFetch = (url, init) => getMainHttpClient().fetch(url, init)
  const service = new McpGatewayService({
    store: new McpConnectionStore(join(directory, 'connections.json')),
    vault,
    pool: new McpUpstreamPool({
      vault,
      access: new McpOAuthAccess(vault, fetcher, Date.now),
      fetch: fetcher,
      clientVersion: options.appVersion,
      resolveCommand: (command) => resolveCommandOnLocalPath(command),
      now: Date.now
    }),
    serverVersion: options.appVersion,
    signIn: (connection, signal) =>
      signInToMcpConnection(connection, {
        vault,
        fetch: fetcher,
        openExternal: options.openExternal,
        now: Date.now,
        clientVersion: options.appVersion,
        signal
      })
  })
  installMcpGateway(service)
  void service.ready().catch((error: unknown) => {
    console.warn('[mcp-gateway] Could not load saved connections:', error)
  })
  return service
}
