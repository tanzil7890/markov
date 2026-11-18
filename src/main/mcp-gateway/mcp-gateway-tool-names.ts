import { createHash } from 'node:crypto'

/** Agents prefix tools with `mcp__markov__` and model APIs cap tool names at 64 characters. */
export const MCP_GATEWAY_TOOL_NAME_MAX = 52
export const MCP_GATEWAY_TOOL_NAME_SEPARATOR = '__'

const DIGEST_CHARS = 8

/** The name an agent sees for a connection's tool: `<connection>__<tool>`, shortened when needed. */
export function exposedMcpToolName(connectionName: string, toolName: string): string {
  const safe = toolName.replaceAll(/[^A-Za-z0-9_-]/g, '_')
  const full = `${connectionName}${MCP_GATEWAY_TOOL_NAME_SEPARATOR}${safe}`
  if (safe === toolName && full.length <= MCP_GATEWAY_TOOL_NAME_MAX) {
    return full
  }
  // A changed or cut name could collide with a sibling, so it carries a digest of the original.
  const digest = createHash('sha256').update(toolName).digest('hex').slice(0, DIGEST_CHARS)
  return `${full.slice(0, MCP_GATEWAY_TOOL_NAME_MAX - DIGEST_CHARS - 1)}_${digest}`
}
