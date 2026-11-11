import type {
  PersistedTrustedMarkovHookRepo,
  PersistedTrustedMarkovHooks
} from './markov-yaml-hook-types'

export type MarkovHookTrustKind = Exclude<keyof PersistedTrustedMarkovHookRepo, 'all'>

export function canUseRepoWideTrust(
  trust: PersistedTrustedMarkovHooks,
  repos: readonly { id: string }[],
  repoId: string
): boolean {
  // Why: with the id on two hosts, trusting one row's script could run the other's unseen.
  return Boolean(trust[repoId]?.all) && repos.filter((repo) => repo.id === repoId).length < 2
}

/** Returns `trust` itself when the approval is already recorded. */
export function withMarkovHookScriptConfirmed(
  trust: PersistedTrustedMarkovHooks,
  repoId: string,
  kind: MarkovHookTrustKind,
  contentHash: string,
  approvedAt: number = Date.now()
): PersistedTrustedMarkovHooks {
  const existing = trust[repoId]
  if (existing?.[kind]?.contentHash === contentHash) {
    return trust
  }
  return { ...trust, [repoId]: { ...existing, [kind]: { contentHash, approvedAt } } }
}

/** Returns `trust` itself when the repo is already always-trusted. */
export function withMarkovHookRepoAlwaysTrusted(
  trust: PersistedTrustedMarkovHooks,
  repoId: string,
  approvedAt: number = Date.now()
): PersistedTrustedMarkovHooks {
  const existing = trust[repoId]
  if (existing?.all) {
    return trust
  }
  return { ...trust, [repoId]: { ...existing, all: { approvedAt } } }
}
