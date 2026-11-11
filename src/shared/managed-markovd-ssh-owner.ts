import type { SshTarget, SshTargetOwner } from './ssh-types'

/** The runtime id phase-3 builds wrote into `owner` before the fence moved to `markovdFence`. */
const LEGACY_MANAGED_MARKOVD_RUNTIME_ID_PREFIX = 'managed-markovd:'

/** The managed Markov server this host serves, or null for a direct SSH host. */
export function getManagedMarkovdFenceEnvironmentId(
  target: Pick<SshTarget, 'markovdFence'> | undefined
): string | null {
  return target?.markovdFence?.environmentId || null
}

/** Reads a legacy `owner` fence, only to migrate it to `markovdFence` on load. */
export function getLegacyManagedMarkovdOwnerEnvironmentId(
  owner: SshTargetOwner | undefined
): string | null {
  if (!owner?.runtimeId.startsWith(LEGACY_MANAGED_MARKOVD_RUNTIME_ID_PREFIX)) {
    return null
  }
  return owner.runtimeId.slice(LEGACY_MANAGED_MARKOVD_RUNTIME_ID_PREFIX.length) || null
}

export function isEphemeralRuntimeSshOwner(owner: SshTargetOwner | undefined): boolean {
  return (
    owner?.type === 'on-demand-runtime' && getLegacyManagedMarkovdOwnerEnvironmentId(owner) === null
  )
}

/** Every VM a recipe makes shares its label, so the runtime id keeps their server names unique. */
export function managedMarkovdServerName(target: Pick<SshTarget, 'label' | 'owner'>): string {
  const runtimeId = isEphemeralRuntimeSshOwner(target.owner) ? target.owner?.runtimeId : undefined
  return runtimeId ? `${target.label} VM ${runtimeId.slice(-8)}` : target.label
}
