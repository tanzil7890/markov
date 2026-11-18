import { z } from 'zod'

export const jsonRpcIdSchema = z.union([z.string(), z.number()])

export type JsonRpcId = z.infer<typeof jsonRpcIdSchema>

const jsonRpcErrorBodySchema = z.looseObject({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional()
})

export const jsonRpcMessageSchema = z.looseObject({
  jsonrpc: z.literal('2.0'),
  id: jsonRpcIdSchema.nullable().optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: jsonRpcErrorBodySchema.optional()
})

export type JsonRpcMessage = z.infer<typeof jsonRpcMessageSchema>

export const JSON_RPC_INVALID_REQUEST = -32600
export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INVALID_PARAMS = -32602
export const JSON_RPC_INTERNAL_ERROR = -32603

/** A JSON-RPC error answered by the peer, as opposed to a transport failure. */
export class McpRpcError extends Error {
  readonly code: number
  readonly data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'McpRpcError'
    this.code = code
    this.data = data
  }
}

export function jsonRpcRequest(id: JsonRpcId, method: string, params?: unknown): JsonRpcMessage {
  return params === undefined
    ? { jsonrpc: '2.0', id, method }
    : { jsonrpc: '2.0', id, method, params }
}

export function jsonRpcNotification(method: string, params?: unknown): JsonRpcMessage {
  return params === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', method, params }
}

export function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcMessage {
  return { jsonrpc: '2.0', id, result }
}

export function jsonRpcError(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data }
  }
}

export function isJsonRpcRequest(
  message: JsonRpcMessage
): message is JsonRpcMessage & { id: JsonRpcId; method: string } {
  return message.method !== undefined && message.id !== undefined && message.id !== null
}

export function isJsonRpcResponse(message: JsonRpcMessage): boolean {
  return (
    message.method === undefined && (message.result !== undefined || message.error !== undefined)
  )
}
