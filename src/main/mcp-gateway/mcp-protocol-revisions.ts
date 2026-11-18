/** Tool listings and calls are forwarded unchanged, so every revision that carries them is served. */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05'
]

export const MCP_PREFERRED_PROTOCOL_VERSION = '2025-06-18'

export function isSupportedMcpProtocolVersion(version: string): boolean {
  return MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(version)
}

/** The revision to answer an agent's `initialize` with: theirs when known, ours otherwise. */
export function negotiateMcpProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' && isSupportedMcpProtocolVersion(requested)
    ? requested
    : MCP_PREFERRED_PROTOCOL_VERSION
}
