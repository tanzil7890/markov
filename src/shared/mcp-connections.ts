import { z } from 'zod'

/** Lowercase so it reads well as the prefix of every tool name; no underscore so `__` ends it. */
export const MCP_CONNECTION_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,19}$/
export const MCP_CONNECTION_LIMIT = 40

const secretNameSchema = z.string().min(1).max(128)

const httpTransportSchema = z.object({
  kind: z.literal('http'),
  url: z.url({ protocol: /^https?$/ }).max(2048)
})

const stdioTransportSchema = z.object({
  kind: z.literal('stdio'),
  command: z.string().min(1).max(1024),
  args: z.array(z.string().max(4096)).max(64)
})

const mcpConnectionTransportSchema = z.discriminatedUnion('kind', [
  httpTransportSchema,
  stdioTransportSchema
])

export const mcpConnectionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().regex(MCP_CONNECTION_NAME_PATTERN),
  title: z.string().min(1).max(80),
  enabled: z.boolean(),
  transport: mcpConnectionTransportSchema,
  /** Header names (http) or environment variable names (stdio); values stay in the secret store. */
  secretNames: z.array(secretNameSchema).max(32),
  createdAt: z.number()
})

export type McpConnection = z.infer<typeof mcpConnectionSchema>

export const mcpConnectionDraftSchema = z.object({
  name: z.string().regex(MCP_CONNECTION_NAME_PATTERN),
  title: z.string().min(1).max(80),
  transport: mcpConnectionTransportSchema,
  /** Header or environment values keyed by name. */
  secrets: z.record(secretNameSchema, z.string().max(16_384))
})

export type McpConnectionDraft = z.infer<typeof mcpConnectionDraftSchema>

export type McpConnectionState =
  | 'disabled'
  | 'unchecked'
  | 'checking'
  | 'connected'
  | 'needs-sign-in'
  | 'failed'

export type McpConnectionStatus = {
  state: McpConnectionState
  toolCount: number | null
  /** Why the last check failed, in words fit for the settings page. */
  message: string | null
}

export type McpConnectionSummary = McpConnection & {
  status: McpConnectionStatus
  /** A browser sign-in is stored for this connection. */
  signedIn: boolean
}

export type McpConnectionActionResult = { ok: true } | { ok: false; error: string }

/** One tool a connection offers, as its server names and describes it. */
export type McpConnectionTool = { name: string; description: string | null }

export type McpConnectionToolsResult =
  | { ok: true; tools: McpConnectionTool[] }
  | { ok: false; error: string }

export const MCP_CONNECTIONS_CHANGED_CHANNEL = 'mcpConnections:changed'

/** A connection name suggested from free text, or null when nothing usable remains. */
export function suggestMcpConnectionName(text: string): string | null {
  const name = text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 20)
    .replaceAll(/-+$/g, '')
  return MCP_CONNECTION_NAME_PATTERN.test(name) ? name : null
}
