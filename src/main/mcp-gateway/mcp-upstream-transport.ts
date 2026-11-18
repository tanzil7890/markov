export type McpRequestOptions = {
  signal?: AbortSignal
  timeoutMs: number
}

/** One JSON-RPC channel to an MCP server. Peer errors reject with McpRpcError, everything else with McpTransportError. */
export type McpUpstreamTransport = {
  request(method: string, params: unknown, options: McpRequestOptions): Promise<unknown>
  notify(method: string, params?: unknown): Promise<void>
  setProtocolVersion(version: string): void
  close(): Promise<void>
}

export type McpTransportFailure =
  | 'unreachable'
  | 'rejected'
  | 'auth-required'
  | 'session-expired'
  | 'closed'
  | 'timeout'
  | 'protocol'

export class McpTransportError extends Error {
  readonly failure: McpTransportFailure
  /** The request never reached the server, so sending it again cannot run a tool twice. */
  readonly retryable: boolean
  /** The WWW-Authenticate header of a 401, used to discover how to sign in. */
  readonly challenge: string | null

  constructor(
    failure: McpTransportFailure,
    message: string,
    options: { retryable?: boolean; challenge?: string | null } = {}
  ) {
    super(message)
    this.name = 'McpTransportError'
    this.failure = failure
    this.retryable = options.retryable ?? false
    this.challenge = options.challenge ?? null
  }
}

export function isMcpTransportError(error: unknown): error is McpTransportError {
  return error instanceof Error && error.name === 'McpTransportError'
}
