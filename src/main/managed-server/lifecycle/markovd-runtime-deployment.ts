// Target claims preserve environment identity so interrupted deploys resume the same registration.
import { getAppEnvironment } from '../../../shared/app-environment'
import { randomUUID } from 'node:crypto'
import { assertRuntimeEnvironmentNotReconciling } from '../../../shared/remote-runtime/host-catalog/runtime-environment-reconciliation-record'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { addManagedMarkovdEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import {
  getMarkovdSshDeployment,
  redactRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  MARKOVD_MANAGED_REMOTE_PORT,
  type MarkovdManagedDeferral,
  type MarkovdManagedDeployResult
} from '../../../shared/markovd-managed-runtime'
import { getManagedMarkovdFenceEnvironmentId } from '../../../shared/managed-markovd-ssh-owner'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import { materializeMarkovdArtifact } from '../../markovd/markovd-artifact-materializer'
import {
  closeMarkovdManagedTunnel,
  ensureMarkovdManagedTunnel,
  startMarkovdManagedTunnel
} from './markovd-managed-tunnel'
import { recoverInterruptedMarkovdActivation } from '../activation/markovd-activation-recovery'
import { wakeAlreadyActiveMarkovd } from '../../ssh/markovd-already-active-wake'
import { readMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import {
  resolveMarkovdRemoteContext,
  type MarkovdRemoteContext
} from '../install/markovd-remote-context'
import { deployMarkovd } from '../../ssh/markovd-remote-deploy'
import {
  adoptRunningMarkovdVersion,
  type MarkovdRunningAdoption
} from '../../ssh/markovd-running-version-adoption'
import { readLocalFullVersion } from '../install/remote-versioned-install'
import { sshMarkovdHostTransport } from '../../ssh/markovd-ssh-host-transport'
import { MARKOVD_ACTIVATION_POLICY_REFUSED_CODE } from '../../ssh/markovd-installed-activation'
import { pruneManagedMarkovdVersions } from './markovd-managed-version-gc'
import { tunneledMarkovdPairingCode } from '../../ssh/markovd-tunneled-pairing'
import { resolveMarkovdMigrationFence } from '../../ssh/markovd-migration-source-fence'
import type { SshTarget } from '../../../shared/ssh-types'
import { findCollidingEnvironmentName } from '../../../shared/remote-runtime/host-catalog/runtime-environment-name-collision'
import { deployedMarkovdTunnelChecks } from './markovd-managed-tunnel-identity'
import {
  isForceableMarkovdDeferral,
  managedMarkovdDeployPolicy,
  managedMarkovdSlot,
  probeManagedMarkovdReadiness,
  requireManagedMarkovdInfrastructure
} from './markovd-managed-runtime-context'

export async function createManagedMarkovdEnvironment(
  userDataPath: string,
  args: {
    name: string
    sshTargetId: string
    force?: boolean
    signal?: AbortSignal
    migration?: boolean
  }
): Promise<MarkovdManagedDeployResult> {
  return runTargetLifecycle(args.sshTargetId, async () => {
    const { connectionManager, targetStore, claims } = requireManagedMarkovdInfrastructure()
    const environmentId =
      getManagedMarkovdFenceEnvironmentId(targetStore.getTarget(args.sshTargetId)) ?? randomUUID()
    // Duplicate/name checks before an add: a crash-zeroed list (#18766) must read as empty here.
    const environments = listEnvironments(userDataPath, { recoverBlankStore: true })
    const registered = environments.find((entry) => entry.id === environmentId)
    if (registered) {
      assertRuntimeEnvironmentNotReconciling(registered)
      if (getMarkovdSshDeployment(registered)?.sshTargetId !== args.sshTargetId) {
        throw new Error('The SSH target is owned by a server that is not deployed on it.')
      }
    }
    const namesake = findCollidingEnvironmentName(
      environments.filter((entry) => entry.id !== environmentId),
      args.name
    )
    if (namesake) {
      throw new Error(`A server named "${namesake.name}" already exists.`)
    }
    const current = targetStore.getTarget(args.sshTargetId)
    if (args.migration) {
      assertMigrationFence(userDataPath, current, environmentId, args.name)
    }
    const claimed = claims.claim(args.sshTargetId, environmentId, {
      ...(args.migration ? {} : { deployName: args.name }),
      ownerRecorded:
        Boolean(args.migration) || Boolean(current?.markovdProvisioning) || Boolean(registered)
    })
    await claims.flush(args.signal)
    const targetGeneration = claimed.generation
    if (targetGeneration === undefined) {
      throw new Error(
        'The SSH registration for this host’s Markov server has no durable generation.'
      )
    }
    if (
      registered &&
      getMarkovdSshDeployment(registered)?.sshTargetGeneration !== targetGeneration
    ) {
      throw new Error('The saved Markov server for this host has a stale SSH target generation.')
    }
    let environmentRegistered = false
    try {
      const connection = await connectionManager.connect(claimed)
      let context = await resolveMarkovdRemoteContext(
        claimed,
        sshMarkovdHostTransport(connection),
        args.signal
      )
      const slot = managedMarkovdSlot(context, MARKOVD_MANAGED_REMOTE_PORT, args.signal)
      const recovery = await recoverInterruptedMarkovdActivation(slot)
      if (recovery.outcome === 'pending' || recovery.outcome === 'refused') {
        throw new Error(recovery.reason)
      }
      if (recovery.outcome === 'recovered') {
        context = { ...context, activationRecord: await readMarkovdActivationRecord(slot) }
      }
      if (registered) {
        environmentRegistered = true
        const current = await ensureMarkovdManagedTunnel(userDataPath, registered.id)
        const activeVersion = context.activationRecord.active
        if (!activeVersion) {
          throw new Error('This host’s Markov server has no active runtime version.')
        }
        return {
          outcome: 'already-current',
          environment: redactRuntimeEnvironment(current),
          activeVersion
        }
      }
      const localMarkovdDir = await materializeMarkovdArtifact(context.serverTarget, {
        signal: args.signal
      })
      // Adopt before upload: only the paired incumbent can count terminals; redeploy would defer.
      const localVersion = readLocalFullVersion(localMarkovdDir)
      const adopted = args.force
        ? null
        : await adoptRunningMarkovdVersion(slot, context.activationRecord, localVersion)
      const { active } = context.activationRecord
      if (!adopted && !args.force && active && active !== localVersion) {
        // Wake may observe a peer's changed record; census admission must use that same record.
        context = { ...context, activationRecord: await readMarkovdActivationRecord(slot) }
      }
      const serving: DeployedMarkovd | MarkovdManagedDeferral =
        adopted ??
        (await deployOwnMarkovd(context, { ...slot, conn: connection }, localMarkovdDir, args))
      if ('outcome' in serving) {
        return serving
      }
      // Read the bound port: the preferred port may belong to another host process.
      const tunnel = deployedMarkovdTunnelChecks(serving.readiness, serving.reprobe)
      const localPort = await startMarkovdManagedTunnel(
        environmentId,
        claimed,
        connection,
        tunnel.remotePort,
        { ...tunnel, preferredPort: MARKOVD_MANAGED_REMOTE_PORT }
      )
      const environment = addManagedMarkovdEnvironment(userDataPath, {
        id: environmentId,
        name: args.name,
        pairingCode: tunneledMarkovdPairingCode(tunnel.readiness(), localPort),
        markovdDeployment: {
          sshTargetId: claimed.id,
          sshTargetGeneration: targetGeneration,
          localPort,
          remotePort: MARKOVD_MANAGED_REMOTE_PORT
        }
      })
      environmentRegistered = true
      return {
        outcome: serving.created ? 'created' : 'already-current',
        environment: redactRuntimeEnvironment(environment),
        activeVersion: serving.version
      }
    } finally {
      if (!environmentRegistered) {
        await closeMarkovdManagedTunnel(environmentId).catch(() => undefined)
      }
    }
  })
}

type DeployedMarkovd = MarkovdRunningAdoption & { created?: true }

async function deployOwnMarkovd(
  context: MarkovdRemoteContext<SshTarget>,
  slot: ReturnType<typeof managedMarkovdSlot>,
  localMarkovdDir: string,
  args: { force?: boolean; signal?: AbortSignal }
): Promise<DeployedMarkovd | MarkovdManagedDeferral> {
  const appVersion = getAppEnvironment().getVersion()
  const deployResult = await deployMarkovd({
    ...slot,
    localMarkovdDir,
    target: context.serverTarget,
    ...managedMarkovdDeployPolicy(context, appVersion, args.force ? 'force' : 'connect'),
    force: args.force,
    appVersion
  })
  if (deployResult.outcome === 'installed-not-activated') {
    return {
      outcome: 'deferred',
      candidateVersion: deployResult.fullVersion,
      code: deployResult.code,
      reason: deployResult.reason,
      forceable:
        isForceableMarkovdDeferral(deployResult.code) ||
        deployResult.code === MARKOVD_ACTIVATION_POLICY_REFUSED_CODE
    }
  }
  if (deployResult.outcome === 'already-active') {
    await wakeAlreadyActiveMarkovd(slot)
  }
  const reprobe = () =>
    probeManagedMarkovdReadiness(context, localMarkovdDir, deployResult.fullVersion, args.signal)
  const readiness = await reprobe()
  await pruneManagedMarkovdVersions({
    slot,
    serverTarget: context.serverTarget,
    activeVersion: deployResult.fullVersion,
    readiness
  })
  return {
    version: deployResult.fullVersion,
    readiness,
    reprobe,
    ...(deployResult.outcome === 'already-active' ? {} : { created: true as const })
  }
}

function assertMigrationFence(
  userDataPath: string,
  target: SshTarget | undefined,
  environmentId: string,
  name: string
): void {
  const fence = target ? resolveMarkovdMigrationFence(userDataPath, target) : null
  if (
    fence?.state !== 'fenced' ||
    fence.cutover.destinationEnvironmentId !== environmentId ||
    fence.cutover.destinationName !== name
  ) {
    throw new Error('markovd_migration_fence_required')
  }
}
