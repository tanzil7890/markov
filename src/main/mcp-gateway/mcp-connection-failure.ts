import { ZodError } from 'zod'
import type { McpConnectionStatus } from '../../shared/mcp-connections'
import { McpRpcError } from './mcp-json-rpc'
import { isMcpTransportError } from './mcp-upstream-transport'

export function isMcpSignInRequired(error: unknown): boolean {
  return isMcpTransportError(error) && error.failure === 'auth-required'
}

/** Why a connection could not serve a request, in words fit for the settings page. */
export function mcpConnectionFailureMessage(error: unknown): string {
  if (isMcpSignInRequired(error)) {
    return 'This server needs a sign-in or an API key.'
  }
  if (error instanceof ZodError) {
    return 'The server sent a reply Markov could not read.'
  }
  if (error instanceof McpRpcError) {
    return `The server answered with an error: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}

export function mcpConnectionFailureStatus(error: unknown): McpConnectionStatus {
  return {
    state: isMcpSignInRequired(error) ? 'needs-sign-in' : 'failed',
    toolCount: null,
    message: mcpConnectionFailureMessage(error)
  }
}
