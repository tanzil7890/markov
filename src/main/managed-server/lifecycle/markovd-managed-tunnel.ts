import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { SshTarget } from '../../../shared/ssh-types'
import type { SshConnection } from '../../ssh/connection/ssh-connection'
import { probeManagedMarkovdTunnel } from './markovd-managed-tunnel-resume'
import {
  ensureManagedMarkovdServing,
  forgetManagedMarkovdServingVerdict
} from './markovd-managed-serving'
import { getManagedMarkovdCrashLoopBrake } from './markovd-managed-crash-loop'
import { MarkovdManagedTunnelManager } from './markovd-managed-tunnel-manager'
import { buildOnBindableLocalPort } from './markovd-managed-tunnel-local-port'
import { getRemoteRuntimeSharedControlAnsweredAt } from '../../ipc/runtime-environments/runtime-environment-shared-control-answers'
import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../ssh/targets/ssh-target-registry'
import {
  MANAGED_MARKOVD_TUNNEL_TARGETING,
  type MarkovdTunnelStartChecks
} from './markovd-managed-tunnel-target'
import {
  liveManagedMarkovdPairingRepairDeps,
  ManagedMarkovdPairingRepairs,
  pairingRevisionOf
} from './markovd-managed-pairing-repair'
import {
  buildWithPairingRepair,
  type ManagedMarkovdPairingRecovery
} from './markovd-managed-tunnel-pairing-recovery'

const managedTunnels = new MarkovdManagedTunnelManager({
  getConnectionManager: getSshConnectionManager,
  getTargetStore: getSshTargetRegistryStore,
  targeting: MANAGED_MARKOVD_TUNNEL_TARGETING,
  ensureServing: (input) =>
    ensureManagedMarkovdServing({
      ...input,
      probe: probeManagedMarkovdTunnel,
      answeredAt: getRemoteRuntimeSharedControlAnsweredAt
    })
})

const pairingRepairs = new Map<string, ManagedMarkovdPairingRepairs>()

function pairingRecovery(userDataPath: string): ManagedMarkovdPairingRecovery {
  let repairs = pairingRepairs.get(userDataPath)
  if (!repairs) {
    repairs = new ManagedMarkovdPairingRepairs(liveManagedMarkovdPairingRepairDeps(userDataPath))
    pairingRepairs.set(userDataPath, repairs)
  }
  return {
    resolve: (environmentId) => resolveEnvironment(userDataPath, environmentId),
    repairs,
    ensure: (environment) =>
      managedTunnels.ensure(environment, () =>
        resolveEnvironmentOrNull(userDataPath, environment.id)
      )
  }
}

/** Return stored credentials: tunnel repair may have replaced the pairing. */
export async function ensureMarkovdManagedTunnel(
  userDataPath: string,
  selector: string
): Promise<KnownRuntimeEnvironment> {
  const { id } = resolveEnvironment(userDataPath, selector)
  await buildOnBindableLocalPort(userDataPath, id, () =>
    buildWithPairingRepair(pairingRecovery(userDataPath), id, (environment) =>
      managedTunnels.ensure(environment, () => resolveEnvironmentOrNull(userDataPath, id))
    )
  )
  return resolveEnvironment(userDataPath, id)
}

export async function rebuildMarkovdManagedTunnel(
  userDataPath: string,
  selector: string
): Promise<'built' | 'repaired'> {
  const { id } = resolveEnvironment(userDataPath, selector)
  return buildOnBindableLocalPort(userDataPath, id, () =>
    buildWithPairingRepair(pairingRecovery(userDataPath), id, (environment) =>
      managedTunnels.rebuild(environment, () => resolveEnvironmentOrNull(userDataPath, id))
    )
  )
}

/** Reprove pinned-server refusal before repair; foreign servers must fail identity validation. */
export function recoverRefusedManagedMarkovdPairing(
  userDataPath: string,
  environmentId: string
): Promise<'built' | 'repaired'> {
  return rebuildMarkovdManagedTunnel(userDataPath, environmentId)
}

/** Ignore failures belonging to older pairing revisions. */
export function managedMarkovdPairingFailureStands(
  userDataPath: string,
  environmentId: string
): boolean {
  const environment = resolveEnvironmentOrNull(userDataPath, environmentId)
  return (
    environment !== null &&
    (pairingRepairs
      .get(userDataPath)
      ?.standingFailure(environmentId, pairingRevisionOf(environment)) ?? null) !== null
  )
}

/** Explicit connect clears recent repair failures and re-arms automatic starts. */
export function forgetManagedMarkovdAutomaticFailures(
  userDataPath: string,
  environmentId: string
): void {
  pairingRepairs.get(userDataPath)?.forgetFailures(environmentId)
  getManagedMarkovdCrashLoopBrake().forget(environmentId)
  forgetManagedMarkovdServingVerdict(environmentId)
}

function resolveEnvironmentOrNull(userDataPath: string, id: string) {
  try {
    return resolveEnvironment(userDataPath, id)
  } catch {
    return null
  }
}

export function verifyManagedTunnelServing(environment: KnownRuntimeEnvironment) {
  return managedTunnels.verifyServing(environment)
}

export function disposeMarkovdManagedTunnels(): void {
  managedTunnels.dispose()
}

// System SSH forwards have independent processes and can outlive Markov.
export function shutdownMarkovdManagedTunnels(): Promise<void> {
  return managedTunnels.shutdown()
}

export function recoverMarkovdManagedTunnelsAfterHostResume(
  userDataPath: string,
  options: { attempts: number; timeoutMs: number }
): Promise<void> {
  return managedTunnels.recoverAfterHostResume({
    ...options,
    resolveEnvironment: (environmentId) => resolveEnvironmentOrNull(userDataPath, environmentId)
  })
}

export function startMarkovdManagedTunnel(
  environmentId: string,
  target: SshTarget,
  connection: SshConnection,
  remotePort: number,
  checks?: MarkovdTunnelStartChecks
): Promise<number> {
  return managedTunnels.start(environmentId, target, connection, remotePort, checks)
}

export function closeMarkovdManagedTunnel(environmentId: string): Promise<void> {
  return managedTunnels.close(environmentId)
}

export function closeMarkovdManagedTunnelsForTarget(targetId: string): Promise<void> {
  return managedTunnels.closeTarget(targetId)
}
