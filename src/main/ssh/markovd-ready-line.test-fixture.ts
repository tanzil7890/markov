export type MarkovdReadyLineOverrides = {
  version?: string
  buildHash?: string
  daemonState?: 'live' | 'degraded' | 'absent'
  selfTestOk?: boolean
}

/** The readiness line a candidate markovd writes; the daemon always reports the candidate build. */
export function markovdReadyLine(
  candidateVersion: string,
  overrides: MarkovdReadyLineOverrides
): string {
  return JSON.stringify({
    type: 'markov_server_ready',
    schemaVersion: 1,
    runtimeId: 'r1',
    boundEndpoint: 'ws://127.0.0.1:7777',
    advertisedEndpoint: null,
    managedWslCliReconciliation: 'settled',
    pairing: { available: false, reason: 'disabled_by_operator', guidance: 'n/a' },
    health: {
      buildHash: overrides.buildHash ?? 'abc123def4567890',
      buildVersion: overrides.version ?? candidateVersion,
      nodeVersion: '20.11.0',
      nodeAbi: '115',
      platform: 'linux',
      arch: 'x64',
      pid: 1,
      terminalDaemon: {
        state: overrides.daemonState ?? 'live',
        ownsFreshSessions: (overrides.daemonState ?? 'live') === 'live',
        pid: 2,
        buildVersion: candidateVersion,
        entryPath: '/x/daemon-entry.js',
        protocolVersion: 3,
        selfTest: {
          ok: overrides.selfTestOk ?? true,
          coverage: 'pty-spawn',
          verdict: (overrides.selfTestOk ?? true) ? 'healthy' : 'pty-spawn-unhealthy',
          durationMs: 5
        }
      }
    }
  })
}
