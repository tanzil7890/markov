export type MarkovdTunnelTransport = 'tcp_forward' | 'stdio_bridge'

const transports = new Map<string, MarkovdTunnelTransport>()

export function rememberMarkovdTunnelTransport(
  targetId: string,
  transport: MarkovdTunnelTransport
): void {
  transports.set(targetId, transport)
}

export function knownMarkovdTunnelTransport(targetId: string): MarkovdTunnelTransport | null {
  return transports.get(targetId) ?? null
}
