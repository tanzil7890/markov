import type {
  McpConnectionActionResult,
  McpConnectionDraft,
  McpConnectionSummary,
  McpConnectionToolsResult
} from '../../shared/mcp-connections'

export type McpConnectionsApi = {
  list: () => Promise<McpConnectionSummary[]>
  add: (draft: McpConnectionDraft) => Promise<McpConnectionActionResult>
  remove: (id: string) => Promise<McpConnectionActionResult>
  setEnabled: (id: string, enabled: boolean) => Promise<McpConnectionActionResult>
  /** Asks the server for its tools again and updates the connection's status. */
  check: (id: string) => Promise<McpConnectionActionResult>
  /** The tools a connected server offers, as agents see them listed. */
  tools: (id: string) => Promise<McpConnectionToolsResult>
  /** Opens the browser sign-in; resolves once it finishes, fails or is cancelled. */
  signIn: (id: string) => Promise<McpConnectionActionResult>
  cancelSignIn: (id: string) => Promise<void>
  signOut: (id: string) => Promise<McpConnectionActionResult>
  onChanged: (callback: () => void) => () => void
}
