import {
  JSON_RPC_METHOD_NOT_FOUND,
  McpRpcError,
  isJsonRpcRequest,
  isJsonRpcResponse,
  jsonRpcError,
  jsonRpcMessageSchema,
  jsonRpcNotification,
  jsonRpcRequest,
  jsonRpcResult,
  type JsonRpcMessage
} from './mcp-json-rpc'
import {
  McpTransportError,
  type McpRequestOptions,
  type McpUpstreamTransport
} from './mcp-upstream-transport'
import { readServerSentEvents } from './server-sent-event-stream'

const MAX_REPLY_BYTES = 64 * 1024 * 1024
const ERROR_BODY_PREVIEW_CHARS = 300

export type McpHttpFetch = (url: string, init: RequestInit) => Promise<Response>

export type McpStreamableHttpTransportOptions = {
  url: string
  fetch: McpHttpFetch
  /** Resolved per request so a refreshed sign-in applies to the next call. */
  headers: () => Promise<Record<string, string>>
  /** Returns true once new credentials are in place and the request is worth repeating. */
  onUnauthorized?: (challenge: string | null) => Promise<boolean>
}

async function discardBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

async function readErrorPreview(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  return text.trim().slice(0, ERROR_BODY_PREVIEW_CHARS)
}

function parseMessages(text: string): JsonRpcMessage[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new McpTransportError('protocol', 'The MCP server sent a reply that is not JSON')
  }
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => {
    const message = jsonRpcMessageSchema.safeParse(entry)
    return message.success ? [message.data] : []
  })
}

export function createMcpStreamableHttpTransport(
  options: McpStreamableHttpTransportOptions
): McpUpstreamTransport {
  let sessionId: string | null = null
  let protocolVersion: string | null = null
  let nextId = 1

  async function post(message: JsonRpcMessage, signal: AbortSignal): Promise<Response> {
    const send = async (): Promise<Response> =>
      options.fetch(options.url, {
        method: 'POST',
        headers: {
          ...(await options.headers()),
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
          ...(protocolVersion ? { 'mcp-protocol-version': protocolVersion } : {})
        },
        body: JSON.stringify(message),
        signal
      })
    let response = await send()
    if (response.status === 401 && options.onUnauthorized) {
      const challenge = response.headers.get('www-authenticate')
      await discardBody(response)
      if (!(await options.onUnauthorized(challenge))) {
        throw new McpTransportError('auth-required', 'The MCP server needs a sign-in', {
          challenge
        })
      }
      response = await send()
    }
    if (response.status === 401) {
      const challenge = response.headers.get('www-authenticate')
      await discardBody(response)
      throw new McpTransportError('auth-required', 'The MCP server needs a sign-in', { challenge })
    }
    if (response.status === 404 && sessionId) {
      sessionId = null
      await discardBody(response)
      throw new McpTransportError('session-expired', 'The MCP server ended the session', {
        retryable: true
      })
    }
    if (!response.ok) {
      const preview = await readErrorPreview(response)
      throw new McpTransportError(
        'rejected',
        `The MCP server answered HTTP ${response.status}${preview ? `: ${preview}` : ''}`
      )
    }
    sessionId = response.headers.get('mcp-session-id') ?? sessionId
    return response
  }

  async function answerServerRequest(message: JsonRpcMessage, signal: AbortSignal): Promise<void> {
    if (!isJsonRpcRequest(message)) {
      return
    }
    const reply =
      message.method === 'ping'
        ? jsonRpcResult(message.id, {})
        : jsonRpcError(message.id, JSON_RPC_METHOD_NOT_FOUND, `Unsupported: ${message.method}`)
    await discardBody(await post(reply, signal))
  }

  async function readReply(
    response: Response,
    id: number,
    signal: AbortSignal
  ): Promise<JsonRpcMessage> {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream') && response.body) {
      for await (const event of readServerSentEvents(response.body, MAX_REPLY_BYTES)) {
        for (const message of parseMessages(event.data)) {
          if (isJsonRpcResponse(message) && message.id === id) {
            return message
          }
          await answerServerRequest(message, signal).catch(() => undefined)
        }
      }
      throw new McpTransportError('protocol', 'The MCP server closed the stream without replying')
    }
    const text = await response.text()
    const reply = parseMessages(text).find(
      (message) => isJsonRpcResponse(message) && message.id === id
    )
    if (!reply) {
      throw new McpTransportError('protocol', 'The MCP server sent no reply to the request')
    }
    return reply
  }

  async function request(
    method: string,
    params: unknown,
    { signal, timeoutMs }: McpRequestOptions
  ): Promise<unknown> {
    const id = nextId++
    const deadline = AbortSignal.timeout(timeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    try {
      const response = await post(jsonRpcRequest(id, method, params), combined)
      const reply = await readReply(response, id, combined)
      if (reply.error) {
        throw new McpRpcError(reply.error.code, reply.error.message, reply.error.data)
      }
      return reply.result
    } catch (error) {
      if (error instanceof McpRpcError || error instanceof McpTransportError) {
        throw error
      }
      signal?.throwIfAborted()
      if (deadline.aborted) {
        throw new McpTransportError('timeout', `The MCP server did not answer ${method} in time`)
      }
      throw new McpTransportError(
        'unreachable',
        `Could not reach the MCP server: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return {
    request,
    async notify(method, params) {
      const response = await post(jsonRpcNotification(method, params), AbortSignal.timeout(30_000))
      await discardBody(response)
    },
    setProtocolVersion(version) {
      protocolVersion = version
    },
    async close() {
      if (!sessionId) {
        return
      }
      const endedSession = sessionId
      sessionId = null
      // Servers may refuse session deletion; either way the session is no longer ours.
      await options
        .fetch(options.url, {
          method: 'DELETE',
          headers: { ...(await options.headers()), 'mcp-session-id': endedSession },
          signal: AbortSignal.timeout(5_000)
        })
        .then(discardBody, () => undefined)
    }
  }
}
