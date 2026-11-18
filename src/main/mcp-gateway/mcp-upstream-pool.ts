import { homedir } from 'node:os'
import type { McpConnection } from '../../shared/mcp-connections'
import type { McpConnectionSecretVault } from './mcp-connection-secret-vault'
import type { McpOAuthAccess } from './mcp-oauth-access'
import { createMcpStdioTransport } from './mcp-stdio-transport'
import {
  createMcpStreamableHttpTransport,
  type McpHttpFetch
} from './mcp-streamable-http-transport'
import { McpUpstreamSession, type McpTool } from './mcp-upstream-session'
import type { McpUpstreamTransport } from './mcp-upstream-transport'

const TOOL_LIST_TTL_MS = 5 * 60_000

export type McpUpstreamPoolOptions = {
  vault: McpConnectionSecretVault
  access: McpOAuthAccess
  fetch: McpHttpFetch
  clientVersion: string
  /** The absolute path of a command on this machine, or null when it is not installed. */
  resolveCommand: (command: string) => Promise<string | null>
  now: () => number
}

type PooledUpstream = {
  session: McpUpstreamSession
  tools: McpTool[] | null
  listedAt: number
  listing: Promise<McpTool[]> | null
}

/** One live session per connection, shared by every agent, with a short-lived tool list. */
export class McpUpstreamPool {
  private readonly upstreams = new Map<string, PooledUpstream>()

  constructor(private readonly options: McpUpstreamPoolOptions) {}

  /** `fresh` asks the server again even when a recent list is held. */
  async listTools(
    connection: McpConnection,
    request: { signal?: AbortSignal; fresh?: boolean } = {}
  ): Promise<McpTool[]> {
    const upstream = this.upstream(connection)
    const current =
      upstream.tools !== null && this.options.now() - upstream.listedAt < TOOL_LIST_TTL_MS
    if (current && !request.fresh && upstream.tools) {
      return upstream.tools
    }
    upstream.listing ??= upstream.session
      .listTools()
      .then((tools) => {
        upstream.tools = tools
        upstream.listedAt = this.options.now()
        return tools
      })
      .finally(() => {
        upstream.listing = null
      })
    const listing = upstream.listing
    if (!request.signal) {
      return listing
    }
    const signal = request.signal
    // The shared listing keeps running for other callers when this one gives up.
    return Promise.race([
      listing,
      new Promise<never>((_resolve, reject) => {
        signal.throwIfAborted()
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    ])
  }

  callTool(
    connection: McpConnection,
    toolName: string,
    args: unknown,
    meta: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    return this.upstream(connection).session.callTool(toolName, args, meta, signal)
  }

  /** Call after a connection's settings or secrets change, or when it is switched off or removed. */
  async drop(connectionId: string): Promise<void> {
    const upstream = this.upstreams.get(connectionId)
    this.upstreams.delete(connectionId)
    await upstream?.session.close().catch(() => undefined)
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.upstreams.keys()].map((connectionId) => this.drop(connectionId)))
  }

  private upstream(connection: McpConnection): PooledUpstream {
    const existing = this.upstreams.get(connection.id)
    if (existing) {
      return existing
    }
    const upstream: PooledUpstream = {
      session: new McpUpstreamSession({
        clientVersion: this.options.clientVersion,
        createTransport: () => this.createTransport(connection)
      }),
      tools: null,
      listedAt: 0,
      listing: null
    }
    this.upstreams.set(connection.id, upstream)
    return upstream
  }

  private async createTransport(connection: McpConnection): Promise<McpUpstreamTransport> {
    const { vault, access } = this.options
    if (connection.transport.kind === 'http') {
      return createMcpStreamableHttpTransport({
        url: connection.transport.url,
        fetch: this.options.fetch,
        headers: async () => {
          const token = await access.accessToken(connection.id)
          return {
            ...(await vault.read(connection.id)).values,
            ...(token ? { authorization: `Bearer ${token}` } : {})
          }
        },
        onUnauthorized: () => access.renew(connection.id)
      })
    }
    const { command, args } = connection.transport
    return createMcpStdioTransport({
      command: (await this.options.resolveCommand(command)) ?? command,
      args,
      // Packaged apps start in `/`, which servers that write relative files cannot use.
      cwd: homedir(),
      env: (await vault.read(connection.id)).values
    })
  }
}
