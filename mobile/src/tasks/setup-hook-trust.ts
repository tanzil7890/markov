import type { PersistedTrustedMarkovHooks } from '../../../src/shared/markov-yaml-hook-types'
import {
  canUseRepoWideTrust,
  type MarkovHookTrustKind,
  withMarkovHookRepoAlwaysTrusted,
  withMarkovHookScriptConfirmed
} from '../../../src/shared/markov-hook-trust-entries'
import type { RpcClient } from '../transport/rpc-client'
import { taskUiStateWrite } from './mobile-task-runtime-operations'

export type SetupHookTrust = {
  contentHash: string
  scriptContent: string
}

export function isMarkovHookTrusted(
  trust: PersistedTrustedMarkovHooks,
  repos: readonly { id: string }[],
  repoId: string,
  kind: MarkovHookTrustKind,
  contentHash: string
): boolean {
  return (
    canUseRepoWideTrust(trust, repos, repoId) || trust[repoId]?.[kind]?.contentHash === contentHash
  )
}

export function isSetupHookTrusted(
  trust: PersistedTrustedMarkovHooks,
  repos: readonly { id: string }[],
  repoId: string,
  contentHash: string
): boolean {
  return isMarkovHookTrusted(trust, repos, repoId, 'setup', contentHash)
}

export function wasMarkovHookPreviouslyApproved(
  trust: PersistedTrustedMarkovHooks,
  repoId: string,
  kind: MarkovHookTrustKind
): boolean {
  return Boolean(trust[repoId]?.[kind]?.contentHash)
}

export function wasSetupHookPreviouslyApproved(
  trust: PersistedTrustedMarkovHooks,
  repoId: string
): boolean {
  return wasMarkovHookPreviouslyApproved(trust, repoId, 'setup')
}

type HookTrustApproval = {
  client: RpcClient
  trust: PersistedTrustedMarkovHooks
  repoId: string
  contentHash: string
  alwaysTrust: boolean
}

export async function persistMarkovHookTrustApproval(
  args: HookTrustApproval & { kind: MarkovHookTrustKind }
): Promise<PersistedTrustedMarkovHooks> {
  // Repo-wide trust is ignored when the repo id is on two hosts, so keep this script's approval too.
  const confirmed = withMarkovHookScriptConfirmed(
    args.trust,
    args.repoId,
    args.kind,
    args.contentHash
  )
  const next = args.alwaysTrust
    ? withMarkovHookRepoAlwaysTrusted(confirmed, args.repoId)
    : confirmed
  taskUiStateWrite.interpret(
    await taskUiStateWrite.request(args.client, { trustedMarkovHooks: next })
  )
  return next
}

export function persistSetupHookTrustApproval(
  args: HookTrustApproval
): Promise<PersistedTrustedMarkovHooks> {
  return persistMarkovHookTrustApproval({ ...args, kind: 'setup' })
}

// Hooks may omit setupTrust; validate the pair here while preserving other host fields.
export function normalizeSetupHookTrust(
  setupTrust: { contentHash?: string; scriptContent?: string } | null | undefined
): SetupHookTrust | null {
  const contentHash = setupTrust?.contentHash
  const scriptContent = setupTrust?.scriptContent
  if (!contentHash || !scriptContent) {
    return null
  }
  return { ...setupTrust, contentHash, scriptContent }
}

// New hosts send setupConfig (markov.yaml setup plus defaultTabs commands); older ones only the effective setup script.
export function readRepoHooksSetupCommand(reply: {
  hooks?: { scripts?: { setup?: string } } | null
  setupConfig?: { command: string } | null
}): string | null {
  if (reply.setupConfig !== undefined) {
    return reply.setupConfig?.command.trim() || null
  }
  return reply.hooks?.scripts?.setup?.trim() || null
}
