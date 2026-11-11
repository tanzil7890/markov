/** Census through the managed tunnel before lifecycle changes. Unknown counts never mean zero, so live/uncounted hosts defer update (D7). */
import { getAppEnvironment } from '../../shared/app-environment'
import { assertRuntimeEnvironmentNotReconciling } from '../../shared/remote-runtime/host-catalog/runtime-environment-reconciliation-record'
import {
  redactRuntimeEnvironment,
  type KnownRuntimeEnvironment
} from '../../shared/remote-runtime/host-catalog/runtime-environments'
import type {
  MarkovdManagedDeployResult,
  MarkovdManagedPastLiveTerminals,
  MarkovdManagedRecoveryResult,
  MarkovdManagedRollbackResult
} from '../../shared/markovd-managed-runtime'
import { runTargetLifecycle } from '../ipc/ssh/ssh-target-lifecycle-queue'
import { recoverInterruptedMarkovdActivation } from '../managed-server/activation/markovd-activation-recovery'
import { probeActiveMarkovdReadiness } from './markovd-active-readiness'
import { materializeMarkovdArtifact } from '../markovd/markovd-artifact-materializer'
import { CURRENT_MARKOVD_DAEMON_PROTOCOL } from './markovd-daemon-protocol-crossing'
import { rebuildMarkovdManagedTunnel } from '../managed-server/lifecycle/markovd-managed-tunnel'
import { wakeAlreadyActiveMarkovd } from './markovd-already-active-wake'
import {
  clearManagedMarkovdUpdateDeferral,
  recordManagedMarkovdUpdateDeferral
} from '../managed-server/lifecycle/markovd-managed-update-deferrals'
import {
  isForceableMarkovdDeferral,
  managedMarkovdInstallDir,
  managedMarkovdSlot,
  probeManagedMarkovdReadiness,
  requireManagedMarkovdEnvironment,
  resolveLinkedMarkovdContext
} from '../managed-server/lifecycle/markovd-managed-runtime-context'
import type { MarkovdRemoteContext } from '../managed-server/install/markovd-remote-context'
import { readRemoteMarkovdBuildHash } from '../managed-server/install/markovd-remote-build-hash'
import { deployMarkovd, type MarkovdDeployOptions } from './markovd-remote-deploy'
import type { MarkovdUpdateForce } from './markovd-update-plan'
import { MARKOVD_ACTIVATION_POLICY_REFUSED_CODE } from './markovd-installed-activation'
import {
  pruneManagedMarkovdVersions,
  pruneSupersededMarkovdCandidates
} from '../managed-server/lifecycle/markovd-managed-version-gc'
import { clearMarkovdUpdateFailedThisLaunch } from '../managed-server/lifecycle/markovd-managed-update-failure-memory'
import { admitMarkovdRecordForIntent } from '../managed-server/lifecycle/markovd-managed-update-decision'
import { rollbackMarkovd } from '../managed-server/install/markovd-remote-rollback'
import { collectManagedTerminalCensus } from './markovd-terminal-census-client'
import { updateTerminalCounts } from './markovd-fenced-stop'
import { findIncompleteManagedMarkovdMigration } from '../managed-server/lifecycle/markovd-managed-migration-status'
import { latestMarkovdMigrationInto } from './markovd-migration-rollback-mark'
import { refreshMaintainedMarkovdPairing } from './markovd-maintenance-pairing-refresh'

type LifecycleArgs = { selector: string; signal?: AbortSignal }

export function withManagedMarkovdLifecycle<T>(
  userDataPath: string,
  selector: string,
  run: (managed: ReturnType<typeof requireManagedMarkovdEnvironment>) => Promise<T>
): Promise<T> {
  const { environment, deployment } = requireManagedMarkovdEnvironment(userDataPath, selector)
  return runTargetLifecycle(deployment.sshTargetId, async () => {
    // Re-read in the lifecycle queue because reconciliation/stop may have won first.
    const current = requireManagedMarkovdEnvironment(userDataPath, environment.id)
    assertRuntimeEnvironmentNotReconciling(current.environment)
    return run(current)
  })
}

/** Rebuild forwarding when a launched slot binds a different port. */
export async function followLaunchedServerPort(
  userDataPath: string,
  environmentId: string
): Promise<void> {
  try {
    await rebuildMarkovdManagedTunnel(userDataPath, environmentId)
  } catch (error) {
    // Server already launched; if tunnel rebuild fails, the next connect can forward its bound port.
    console.warn('[ssh] Could not forward to the relaunched managed Markov server:', error)
  }
}

export function updateManagedMarkovdEnvironment(
  userDataPath: string,
  args: LifecycleArgs & { force?: boolean; pastLiveTerminals?: MarkovdManagedPastLiveTerminals }
): Promise<MarkovdManagedDeployResult> {
  const { pastLiveTerminals } = args
  // Update anyway keeps Update's version admission even if a caller also passed force.
  const intent = args.force && !pastLiveTerminals ? 'force' : 'update'
  return withManagedMarkovdLifecycle(userDataPath, args.selector, async (managed) => {
    const admitIntent = admitMarkovdRecordForIntent(intent, getAppEnvironment().getVersion())
    // Checked under the host fence: another desktop may have activated a build since the confirm.
    const admitRecord: NonNullable<MarkovdDeployOptions['admitRecord']> = pastLiveTerminals
      ? (record, candidateVersion) =>
          record.active !== pastLiveTerminals.incumbentVersion
            ? "This host's server changed since the update was confirmed. Review it and update again."
            : admitIntent(record, candidateVersion)
      : admitIntent
    const force: MarkovdUpdateForce | undefined = pastLiveTerminals ? 'live-terminals' : args.force
    const result = await runManagedMarkovdUpdate(
      userDataPath,
      managed,
      await resolveLinkedMarkovdContext(managed.environment, managed.deployment, args.signal),
      { signal: args.signal, force, admitRecord }
    )
    // A completed manual update clears automatic failure suppression; deferred attempts do not.
    if (result.outcome !== 'deferred') {
      clearMarkovdUpdateFailedThisLaunch({ kind: 'ssh', id: managed.deployment.sshTargetId })
    }
    return result
  })
}

export async function runManagedMarkovdUpdate(
  userDataPath: string,
  { environment, deployment }: ReturnType<typeof requireManagedMarkovdEnvironment>,
  context: MarkovdRemoteContext,
  args: {
    force?: MarkovdUpdateForce
    signal?: AbortSignal
    localMarkovdDir?: string
    admitRecord?: MarkovdDeployOptions['admitRecord']
  }
): Promise<MarkovdManagedDeployResult> {
  const { countFirst, ...recount } = updateTerminalCounts((options) =>
    collectManagedTerminalCensus(
      userDataPath,
      environment,
      context.activationRecord,
      undefined,
      options
    )
  )
  const census = await countFirst()
  const localMarkovdDir =
    args.localMarkovdDir ??
    (await materializeMarkovdArtifact(context.serverTarget, { signal: args.signal }))
  const slot = managedMarkovdSlot(context, deployment.remotePort, args.signal)
  const result = await deployMarkovd({
    ...slot,
    localMarkovdDir,
    target: context.serverTarget,
    census,
    ...recount,
    censusRecord: context.activationRecord,
    force: args.force,
    appVersion: getAppEnvironment().getVersion(),
    ...(args.admitRecord ? { admitRecord: args.admitRecord } : {})
  })
  if (result.outcome === 'installed-not-activated') {
    const deferral = {
      outcome: 'deferred' as const,
      candidateVersion: result.fullVersion,
      code: result.code,
      reason: result.reason,
      // Force may override policy deferrals, including a newer host build.
      forceable:
        isForceableMarkovdDeferral(result.code) ||
        result.code === MARKOVD_ACTIVATION_POLICY_REFUSED_CODE
    }
    // Policy refusal is final for this host, not a transient update to retry.
    if (result.code !== MARKOVD_ACTIVATION_POLICY_REFUSED_CODE) {
      recordManagedMarkovdUpdateDeferral(environment.id, deferral, context.activationRecord)
    }
    await pruneSupersededMarkovdCandidates(slot, context.serverTarget, result.fullVersion)
    return deferral
  }
  clearManagedMarkovdUpdateDeferral(environment.id)
  const alreadyActive = result.outcome === 'already-active'
  const managed = { environmentId: environment.id, hostLabel: context.target.label }
  const started = alreadyActive && (await wakeAlreadyActiveMarkovd(slot, managed))
  const readiness = await probeManagedMarkovdReadiness(
    context,
    localMarkovdDir,
    result.fullVersion,
    args.signal
  )
  await pruneManagedMarkovdVersions({
    slot,
    serverTarget: context.serverTarget,
    activeVersion: result.fullVersion,
    readiness
  })
  const updated = refreshMaintainedMarkovdPairing(userDataPath, environment.id, readiness)
  if (started || result.outcome !== 'already-active') {
    await followLaunchedServerPort(userDataPath, environment.id)
  }
  return {
    outcome: result.outcome === 'already-active' ? 'already-current' : 'updated',
    environment: redactRuntimeEnvironment(updated),
    activeVersion: result.fullVersion
  }
}

export function rollbackManagedMarkovdEnvironment(
  userDataPath: string,
  args: LifecycleArgs
): Promise<MarkovdManagedRollbackResult> {
  return withManagedMarkovdLifecycle(
    userDataPath,
    args.selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedMarkovdContext(environment, deployment, args.signal)
      const record = context.activationRecord
      const target = record.previous
      if (!target) {
        return {
          outcome: 'refused',
          code: 'markovd_rollback_no_target',
          reason: 'This server has no previous version to roll back to.'
        }
      }
      const crossing = migrationRollbackRefusal(userDataPath, environment, record.activatedAt)
      if (crossing) {
        return crossing
      }
      const slot = managedMarkovdSlot(context, deployment.remotePort, args.signal)
      const targetDir = managedMarkovdInstallDir(context, target)
      const targetBuildHash = await readRemoteMarkovdBuildHash(slot, targetDir)
      const { countFirst, ...recount } = updateTerminalCounts((options) =>
        collectManagedTerminalCensus(userDataPath, environment, record, undefined, options)
      )
      // Recount under lock before rollback stop; this initial census closes no admission.
      const census = await countFirst()
      // Require idle because this client cannot prove the older build's daemon protocol attaches to live terminals.
      if (census.liveSessions !== 0) {
        return {
          outcome: 'refused',
          code:
            census.liveSessions === null
              ? 'markovd_rollback_census_unavailable'
              : 'markovd_rollback_terminals_running',
          reason:
            census.liveSessions === null
              ? 'The server did not answer how many terminals it runs. Retry when it answers.'
              : 'Close the terminals running on this server before rolling it back.'
        }
      }
      const result = await rollbackMarkovd({
        ...slot,
        record,
        census,
        ...recount,
        targetBuildHash,
        targetDaemonProtocol: CURRENT_MARKOVD_DAEMON_PROTOCOL
      })
      if (result.outcome !== 'rolled-back') {
        return result
      }
      const readiness = await probeActiveMarkovdReadiness(
        { ...slot, remoteInstallDir: targetDir },
        { buildHash: targetBuildHash, fullVersion: result.target }
      )
      const updated = refreshMaintainedMarkovdPairing(userDataPath, environment.id, readiness)
      await followLaunchedServerPort(userDataPath, environment.id)
      return {
        outcome: 'rolled-back',
        environment: redactRuntimeEnvironment(updated),
        activeVersion: result.target,
        discarded: result.discarded
      }
    }
  )
}

export function recoverManagedMarkovdEnvironment(
  userDataPath: string,
  args: LifecycleArgs & { acceptChangedState?: boolean }
): Promise<MarkovdManagedRecoveryResult> {
  return withManagedMarkovdLifecycle(
    userDataPath,
    args.selector,
    async ({ environment, deployment }) => {
      const context = await resolveLinkedMarkovdContext(environment, deployment, args.signal)
      const result = await recoverInterruptedMarkovdActivation({
        ...managedMarkovdSlot(context, deployment.remotePort, args.signal),
        acceptChangedState: args.acceptChangedState === true
      })
      if (result.outcome !== 'recovered') {
        return result
      }
      const updated = result.readiness
        ? refreshMaintainedMarkovdPairing(userDataPath, environment.id, result.readiness)
        : environment
      if (result.activeVersion) {
        await followLaunchedServerPort(userDataPath, environment.id)
      }
      return {
        outcome: 'recovered',
        resolution: result.resolution,
        activeVersion: result.activeVersion,
        environment: redactRuntimeEnvironment(updated)
      }
    }
  )
}

/** A post-activation migration is absent from the rollback snapshot; restoring it would discard imported state. */
function migrationRollbackRefusal(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  activatedAt: string | null
): MarkovdManagedRollbackResult | null {
  if (findIncompleteManagedMarkovdMigration(userDataPath, environment.id)) {
    return {
      outcome: 'refused',
      code: 'markovd_rollback_migration_in_progress',
      reason: 'A migration into this server is still running. Finish it before rolling back.'
    }
  }
  const migratedAt = latestMarkovdMigrationInto(userDataPath, environment)
  if (migratedAt && (activatedAt === null || Date.parse(activatedAt) < Date.parse(migratedAt))) {
    return {
      outcome: 'refused',
      code: 'markovd_rollback_crosses_migration',
      reason:
        "The previous version's state predates the projects migrated onto this server; " +
        'rolling back would lose them. Deploy forward instead.'
    }
  }
  return null
}
