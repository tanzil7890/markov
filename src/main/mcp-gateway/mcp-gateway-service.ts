import { randomUUID } from 'node:crypto'
import {
  MCP_CONNECTION_LIMIT,
  mcpConnectionDraftSchema,
  type McpConnection,
  type McpConnectionDraft,
  type McpConnectionStatus,
  type McpConnectionSummary,
  type McpConnectionTool
} from '../../shared/mcp-connections'
import {
  isMcpSignInRequired,
  mcpConnectionFailureMessage,
  mcpConnectionFailureStatus
} from './mcp-connection-failure'
import type { McpConnectionSecretVault } from './mcp-connection-secret-vault'
import type { McpConnectionStore } from './mcp-connection-store'
import {
  McpGatewayAgentEndpoint,
  type McpGatewayConnectionRef,
  type McpGatewayUpstreams
} from './mcp-gateway-agent-endpoint'
import type { JsonRpcMessage } from './mcp-json-rpc'
import type { McpUpstreamPool } from './mcp-upstream-pool'
import type { McpTool } from './mcp-upstream-session'

export type McpGatewayServiceOptions = {
  store: McpConnectionStore
  vault: McpConnectionSecretVault
  pool: McpUpstreamPool
  serverVersion: string
  /** Runs the browser sign-in and stores its grant; rejects when cancelled or refused. */
  signIn: (connection: McpConnection, signal: AbortSignal) => Promise<void>
}

const UNCHECKED: McpConnectionStatus = { state: 'unchecked', toolCount: null, message: null }
const DISABLED: McpConnectionStatus = { state: 'disabled', toolCount: null, message: null }
const CHECKING: McpConnectionStatus = { state: 'checking', toolCount: null, message: null }

/** Owns the saved connections and serves their tools to every agent through one MCP endpoint. */
export class McpGatewayService implements McpGatewayUpstreams {
  private readonly statuses = new Map<string, McpConnectionStatus>()
  private readonly listeners = new Set<() => void>()
  private readonly signIns = new Map<string, AbortController>()
  private readonly endpoint: McpGatewayAgentEndpoint

  constructor(private readonly options: McpGatewayServiceOptions) {
    this.endpoint = new McpGatewayAgentEndpoint(this, options.serverVersion)
  }

  ready(): Promise<void> {
    return this.options.store.load()
  }

  handleAgentMessage(
    sessionId: string,
    message: unknown,
    gone?: AbortSignal
  ): Promise<JsonRpcMessage | null> {
    return this.endpoint.handle(sessionId, message, gone)
  }

  /** Agents are only given the gateway while it has something to offer. */
  hasActiveConnections(): boolean {
    return this.options.store.list().some((connection) => connection.enabled)
  }

  active(): McpGatewayConnectionRef[] {
    return this.options.store
      .list()
      .filter((connection) => connection.enabled)
      .map(({ id, name }) => ({ id, name }))
  }

  listTools(connectionId: string, signal?: AbortSignal): Promise<McpTool[]> {
    return this.probe(this.enabledConnection(connectionId), signal ? { signal } : {})
  }

  callTool(
    connectionId: string,
    toolName: string,
    args: unknown,
    meta: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    return this.options.pool.callTool(
      this.enabledConnection(connectionId),
      toolName,
      args,
      meta,
      signal
    )
  }

  describeFailure(connectionId: string, error: unknown): string {
    const title = this.find(connectionId)?.title ?? connectionId
    return isMcpSignInRequired(error)
      ? `The "${title}" connection needs a sign-in. Ask the person to open Markov Settings, go to Connections, and sign in.`
      : `The "${title}" connection failed: ${mcpConnectionFailureMessage(error)}`
  }

  list(): Promise<McpConnectionSummary[]> {
    return Promise.all(this.options.store.list().map((connection) => this.summary(connection)))
  }

  async add(input: McpConnectionDraft): Promise<McpConnectionSummary> {
    const draft = mcpConnectionDraftSchema.parse(input)
    const connection: McpConnection = {
      id: randomUUID(),
      name: draft.name,
      title: draft.title,
      enabled: true,
      transport: draft.transport,
      secretNames: Object.keys(draft.secrets),
      createdAt: Date.now()
    }
    await this.options.store.load()
    if (this.options.store.list().some(({ name }) => name === connection.name)) {
      throw new Error(`A connection named "${connection.name}" already exists.`)
    }
    if (this.options.store.list().length >= MCP_CONNECTION_LIMIT) {
      throw new Error(`Markov keeps at most ${MCP_CONNECTION_LIMIT} connections.`)
    }
    // Secrets first: a saved connection must never point at secrets that failed to save.
    await this.options.vault.write(connection.id, { values: draft.secrets, oauth: null })
    await this.options.store.mutate((connections) => [...connections, connection])
    this.changed()
    void this.check(connection.id).catch(() => undefined)
    return this.summary(connection)
  }

  async remove(connectionId: string): Promise<void> {
    await this.options.store.mutate((connections) =>
      connections.filter(({ id }) => id !== connectionId)
    )
    this.statuses.delete(connectionId)
    await this.options.pool.drop(connectionId)
    await this.options.vault.remove(connectionId)
    this.changed()
  }

  async setEnabled(connectionId: string, enabled: boolean): Promise<void> {
    await this.options.store.mutate((connections) =>
      connections.map((connection) =>
        connection.id === connectionId ? { ...connection, enabled } : connection
      )
    )
    this.statuses.delete(connectionId)
    if (enabled) {
      void this.check(connectionId).catch(() => undefined)
    } else {
      await this.options.pool.drop(connectionId)
    }
    this.changed()
  }

  /** Asks the server for its tools again and records the outcome as the connection's status. */
  async check(connectionId: string): Promise<McpConnectionSummary> {
    const connection = this.enabledConnection(connectionId)
    this.setStatus(connectionId, CHECKING)
    await this.probe(connection, { fresh: true }).catch(() => undefined)
    return this.summary(connection)
  }

  /** The connection's tools for the settings page, from the list agents are already served. */
  async tools(connectionId: string): Promise<McpConnectionTool[]> {
    const tools = await this.probe(this.enabledConnection(connectionId), {})
    return tools.map(({ name, description }) => ({
      name,
      description: typeof description === 'string' && description.trim() ? description : null
    }))
  }

  async signIn(connectionId: string): Promise<McpConnectionSummary> {
    const connection = this.enabledConnection(connectionId)
    this.signIns.get(connectionId)?.abort()
    const abort = new AbortController()
    this.signIns.set(connectionId, abort)
    try {
      await this.options.signIn(connection, abort.signal)
    } finally {
      if (this.signIns.get(connectionId) === abort) {
        this.signIns.delete(connectionId)
      }
    }
    return this.reconnect(connectionId)
  }

  cancelSignIn(connectionId: string): void {
    this.signIns.get(connectionId)?.abort()
  }

  async signOut(connectionId: string): Promise<McpConnectionSummary> {
    const secrets = await this.options.vault.read(connectionId)
    await this.options.vault.write(connectionId, { ...secrets, oauth: null })
    return this.reconnect(connectionId)
  }

  /** Connects again with whatever credentials are stored now. */
  private async reconnect(connectionId: string): Promise<McpConnectionSummary> {
    await this.options.pool.drop(connectionId)
    return this.check(connectionId)
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): Promise<void> {
    this.listeners.clear()
    return this.options.pool.dispose()
  }

  private find(connectionId: string): McpConnection | null {
    return this.options.store.list().find(({ id }) => id === connectionId) ?? null
  }

  private enabledConnection(connectionId: string): McpConnection {
    const connection = this.find(connectionId)
    if (!connection?.enabled) {
      throw new Error('This connection is switched off or no longer exists.')
    }
    return connection
  }

  private async probe(
    connection: McpConnection,
    request: { signal?: AbortSignal; fresh?: boolean }
  ): Promise<McpTool[]> {
    try {
      const tools = await this.options.pool.listTools(connection, request)
      this.setStatus(connection.id, { state: 'connected', toolCount: tools.length, message: null })
      return tools
    } catch (error) {
      if (!request.signal?.aborted) {
        this.setStatus(connection.id, mcpConnectionFailureStatus(error))
      }
      throw error
    }
  }

  private async summary(connection: McpConnection): Promise<McpConnectionSummary> {
    return {
      ...connection,
      status: connection.enabled ? (this.statuses.get(connection.id) ?? UNCHECKED) : DISABLED,
      signedIn: (await this.options.vault.read(connection.id)).oauth !== null
    }
  }

  private setStatus(connectionId: string, status: McpConnectionStatus): void {
    const previous = this.statuses.get(connectionId)
    this.statuses.set(connectionId, status)
    if (
      previous?.state !== status.state ||
      previous.toolCount !== status.toolCount ||
      previous.message !== status.message
    ) {
      this.changed()
    }
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}
