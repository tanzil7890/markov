// Remember failures only for this session so restarting retries once.
export type MarkovdUpdateFailureHost = { kind: 'ssh' | 'wsl'; id: string }

export type MarkovdUpdateFailure = { code: string; reason: string }

const failedThisLaunch = new Map<string, MarkovdUpdateFailure>()

function key(host: MarkovdUpdateFailureHost): string {
  return `${host.kind}:${host.id}`
}

export function recordMarkovdUpdateFailedThisLaunch(
  host: MarkovdUpdateFailureHost,
  failure: MarkovdUpdateFailure
): void {
  failedThisLaunch.set(key(host), failure)
}

export function markovdUpdateFailureThisLaunch(
  host: MarkovdUpdateFailureHost
): MarkovdUpdateFailure | null {
  return failedThisLaunch.get(key(host)) ?? null
}

export function markovdUpdateFailedThisLaunch(host: MarkovdUpdateFailureHost): boolean {
  return failedThisLaunch.has(key(host))
}

export function clearMarkovdUpdateFailedThisLaunch(host: MarkovdUpdateFailureHost): void {
  failedThisLaunch.delete(key(host))
}

export function resetMarkovdUpdateFailuresForTests(): void {
  failedThisLaunch.clear()
}
