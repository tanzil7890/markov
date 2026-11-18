import { z } from 'zod'
import { MCP_GATEWAY_SERVER_NAME } from '../../shared/agent-mcp-gateway-launch'
import {
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  McpRpcError,
  isJsonRpcRequest,
  jsonRpcError,
  jsonRpcIdSchema,
  jsonRpcMessageSchema,
  jsonRpcResult,
  type JsonRpcId,
  type JsonRpcMessage
} from './mcp-json-rpc'
import { MCP_GATEWAY_TOOL_NAME_SEPARATOR, exposedMcpToolName } from './mcp-gateway-tool-names'
import { negotiateMcpProtocolVersion } from './mcp-protocol-revisions'
import type { McpTool } from './mcp-upstream-session'

const INSTRUCTIONS =
  'Tools from the services this person connected in Markov. Each tool name starts with the name of its connection.'

const initializeParamsSchema = z.looseObject({ protocolVersion: z.unknown().optional() })

const callParamsSchema = z.looseObject({
  name: z.string(),
  arguments: z.unknown().optional(),
  _meta: z.unknown().optional()
})

const cancelledParamsSchema = z.looseObject({ requestId: jsonRpcIdSchema })

export type McpGatewayConnectionRef = {
  id: string
  name: string
}

/** The connected servers as the endpoint needs them; the gateway service implements it. */
export type McpGatewayUpstreams = {
  active(): McpGatewayConnectionRef[]
  listTools(connectionId: string, signal?: AbortSignal): Promise<McpTool[]>
  callTool(
    connectionId: string,
    toolName: string,
    args: unknown,
    meta: unknown,
    signal?: AbortSignal
  ): Promise<unknown>
  /** Wording an agent can relay when a connection cannot serve a call. */
  describeFailure(connectionId: string, error: unknown): string
}

function toolFailure(text: string): unknown {
  return { content: [{ type: 'text', text }], isError: true }
}

/** Answers one agent's MCP messages with the tools of every active connection. */
export class McpGatewayAgentEndpoint {
  private readonly inFlight = new Map<string, AbortController>()

  constructor(
    private readonly upstreams: McpGatewayUpstreams,
    private readonly serverVersion: string
  ) {}

  /** Returns the reply to write back, or null when the message needs none. `gone` aborts the work when the agent's side of the connection drops. */
  async handle(
    sessionId: string,
    raw: unknown,
    gone?: AbortSignal
  ): Promise<JsonRpcMessage | null> {
    const parsed = jsonRpcMessageSchema.safeParse(raw)
    if (!parsed.success) {
      return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, 'Not a JSON-RPC 2.0 message')
    }
    const message = parsed.data
    if (!isJsonRpcRequest(message)) {
      if (message.method === 'notifications/cancelled') {
        this.cancel(sessionId, message.params)
      }
      return null
    }
    const key = this.requestKey(sessionId, message.id)
    const abort = new AbortController()
    const onGone = (): void => abort.abort()
    gone?.addEventListener('abort', onGone, { once: true })
    if (gone?.aborted) {
      abort.abort()
    }
    this.inFlight.set(key, abort)
    try {
      return jsonRpcResult(
        message.id,
        await this.dispatch(message.method, message.params, abort.signal)
      )
    } catch (error) {
      if (abort.signal.aborted) {
        return null
      }
      if (error instanceof McpRpcError) {
        return jsonRpcError(message.id, error.code, error.message, error.data)
      }
      return jsonRpcError(
        message.id,
        JSON_RPC_INTERNAL_ERROR,
        error instanceof Error ? error.message : String(error)
      )
    } finally {
      gone?.removeEventListener('abort', onGone)
      this.inFlight.delete(key)
    }
  }

  private requestKey(sessionId: string, id: JsonRpcId): string {
    return `${sessionId}\n${typeof id}\n${id}`
  }

  private cancel(sessionId: string, params: unknown): void {
    const parsed = cancelledParamsSchema.safeParse(params)
    if (parsed.success) {
      this.inFlight.get(this.requestKey(sessionId, parsed.data.requestId))?.abort()
    }
  }

  private async dispatch(method: string, params: unknown, signal: AbortSignal): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: negotiateMcpProtocolVersion(
            initializeParamsSchema.safeParse(params).data?.protocolVersion
          ),
          capabilities: { tools: {} },
          serverInfo: {
            name: MCP_GATEWAY_SERVER_NAME,
            title: 'Markov connections',
            version: this.serverVersion
          },
          instructions: INSTRUCTIONS
        }
      case 'ping':
        return {}
      case 'tools/list':
        return { tools: await this.listTools(signal) }
      case 'tools/call':
        return this.callTool(params, signal)
      default:
        throw new McpRpcError(JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${method}`)
    }
  }

  private async listTools(signal: AbortSignal): Promise<McpTool[]> {
    const listings = await Promise.allSettled(
      this.upstreams.active().map(async (connection) =>
        (await this.upstreams.listTools(connection.id, signal)).map((tool) => ({
          ...tool,
          name: exposedMcpToolName(connection.name, tool.name)
        }))
      )
    )
    // One unreachable server must not hide the tools of the others.
    return listings.flatMap((listing) => (listing.status === 'fulfilled' ? listing.value : []))
  }

  private async callTool(params: unknown, signal: AbortSignal): Promise<unknown> {
    const call = callParamsSchema.safeParse(params)
    if (!call.success) {
      throw new McpRpcError(JSON_RPC_INVALID_PARAMS, 'tools/call needs a tool name')
    }
    const connection = this.upstreams
      .active()
      .find(({ name }) => call.data.name.startsWith(`${name}${MCP_GATEWAY_TOOL_NAME_SEPARATOR}`))
    if (!connection) {
      throw new McpRpcError(JSON_RPC_INVALID_PARAMS, `Unknown tool: ${call.data.name}`)
    }
    try {
      const tools = await this.upstreams.listTools(connection.id, signal)
      const tool = tools.find(
        ({ name }) => exposedMcpToolName(connection.name, name) === call.data.name
      )
      if (!tool) {
        throw new McpRpcError(JSON_RPC_INVALID_PARAMS, `Unknown tool: ${call.data.name}`)
      }
      return await this.upstreams.callTool(
        connection.id,
        tool.name,
        call.data.arguments,
        call.data._meta,
        signal
      )
    } catch (error) {
      if (error instanceof McpRpcError || signal.aborted) {
        throw error
      }
      // The model can act on a readable failure; a protocol error would only abort its turn.
      return toolFailure(this.upstreams.describeFailure(connection.id, error))
    }
  }
}
