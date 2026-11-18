import { z } from 'zod'
import {
  MCP_PREFERRED_PROTOCOL_VERSION,
  isSupportedMcpProtocolVersion
} from './mcp-protocol-revisions'
import {
  McpTransportError,
  isMcpTransportError,
  type McpUpstreamTransport
} from './mcp-upstream-transport'

const HANDSHAKE_TIMEOUT_MS = 30_000
const LIST_TIMEOUT_MS = 30_000
const MAX_TOOL_PAGES = 50
export const MCP_TOOL_CALL_TIMEOUT_MS = 10 * 60_000

const initializeResultSchema = z.looseObject({
  protocolVersion: z.string(),
  serverInfo: z
    .looseObject({ name: z.string().optional(), title: z.string().optional() })
    .optional()
})

const toolSchema = z.looseObject({ name: z.string().min(1) })

const toolsPageSchema = z.looseObject({
  tools: z.array(z.unknown()),
  nextCursor: z.string().optional()
})

/** A tool exactly as its server describes it; only `name` is read here. */
export type McpTool = z.infer<typeof toolSchema>

export type McpUpstreamSessionOptions = {
  createTransport: () => McpUpstreamTransport | Promise<McpUpstreamTransport>
  clientVersion: string
}

type Connected = {
  transport: McpUpstreamTransport
  serverName: string | null
}

/** A handshaken connection to one MCP server that reconnects when the server drops it. */
export class McpUpstreamSession {
  private connecting: Promise<Connected> | null = null

  constructor(private readonly options: McpUpstreamSessionOptions) {}

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    return this.run(async ({ transport }) => {
      const tools: McpTool[] = []
      let cursor: string | undefined
      for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
        const result = toolsPageSchema.parse(
          await transport.request('tools/list', cursor ? { cursor } : {}, {
            ...(signal ? { signal } : {}),
            timeoutMs: LIST_TIMEOUT_MS
          })
        )
        for (const entry of result.tools) {
          const tool = toolSchema.safeParse(entry)
          if (tool.success) {
            tools.push(tool.data)
          }
        }
        cursor = result.nextCursor
        if (!cursor) {
          break
        }
      }
      return tools
    })
  }

  async callTool(
    name: string,
    args: unknown,
    meta: unknown,
    signal?: AbortSignal
  ): Promise<unknown> {
    return this.run(({ transport }) =>
      transport.request(
        'tools/call',
        { name, arguments: args ?? {}, ...(meta === undefined ? {} : { _meta: meta }) },
        { ...(signal ? { signal } : {}), timeoutMs: MCP_TOOL_CALL_TIMEOUT_MS }
      )
    )
  }

  /** The name the server gave itself, once connected. */
  async serverName(): Promise<string | null> {
    return this.run(async ({ serverName }) => serverName)
  }

  async close(): Promise<void> {
    if (this.connecting) {
      await this.discard(this.connecting)
    }
  }

  private async run<T>(operation: (connected: Connected) => Promise<T>): Promise<T> {
    const attempt = this.connect()
    try {
      return await operation(await attempt)
    } catch (error) {
      if (!isMcpTransportError(error) || !this.drops(error)) {
        throw error
      }
      await this.discard(attempt)
      if (!error.retryable) {
        throw error
      }
      return operation(await this.connect())
    }
  }

  /** Only the connection that failed is dropped, so a concurrent caller's fresh one survives. */
  private async discard(attempt: Promise<Connected>): Promise<void> {
    if (this.connecting === attempt) {
      this.connecting = null
    }
    const connected = await attempt.catch(() => null)
    await connected?.transport.close().catch(() => undefined)
  }

  private drops(error: McpTransportError): boolean {
    return error.failure === 'closed' || error.failure === 'session-expired'
  }

  private connect(): Promise<Connected> {
    this.connecting ??= this.handshake().catch((error: unknown) => {
      this.connecting = null
      throw error
    })
    return this.connecting
  }

  private async handshake(): Promise<Connected> {
    const transport = await this.options.createTransport()
    try {
      const result = initializeResultSchema.parse(
        await transport.request(
          'initialize',
          {
            protocolVersion: MCP_PREFERRED_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'markov', title: 'Markov', version: this.options.clientVersion }
          },
          { timeoutMs: HANDSHAKE_TIMEOUT_MS }
        )
      )
      if (!isSupportedMcpProtocolVersion(result.protocolVersion)) {
        throw new McpTransportError(
          'protocol',
          `The MCP server uses protocol revision ${result.protocolVersion}, which Markov does not support`
        )
      }
      transport.setProtocolVersion(result.protocolVersion)
      await transport.notify('notifications/initialized')
      return {
        transport,
        serverName: result.serverInfo?.title ?? result.serverInfo?.name ?? null
      }
    } catch (error) {
      await transport.close().catch(() => undefined)
      throw error
    }
  }
}
