// Keep claims, tunnels and registration until the host proves server exit.
import type {
  MarkovdManagedCancelStopResult,
  MarkovdManagedForgetResult,
  MarkovdManagedStopResult
} from '../../../shared/markovd-managed-runtime'
import type { MarkovdDaemonRetirementVerdict } from '../../../shared/markovd-stop-request'
import { removeManagedMarkovdEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { findManagedSshTwin } from '../../../shared/remote-runtime/host-catalog/runtime-environment-host-key-match'
import type {
  KnownRuntimeEnvironment,
  MarkovdSshDeploymentLink
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { recoverInterruptedMarkovdActivation } from '../activation/markovd-activation-recovery'
import { withStaleMarkovdActivationRecoveryLock } from '../activation/markovd-activation-lock'
import { readMarkovdActivationTransaction } from '../activation/markovd-activation-transaction-store'
import { reconcileMarkovdDecommission } from './markovd-decommission-recovery'
import { cancelRemoteMarkovdManagedStop } from './markovd-managed-remote-stop'
import {
  managedMarkovdSlot,
  requireManagedMarkovdInfrastructure,
  resolveLinkedMarkovdContext
} from './markovd-managed-runtime-context'
import { closeMarkovdManagedTunnel, ensureMarkovdManagedTunnel } from './markovd-managed-tunnel'
import { clearManagedMarkovdUpdateDeferral } from './markovd-managed-update-deferrals'
import { removeMarkovdMigrationJournalsForDestination } from '../../ssh/markovd-migration-cutover-journal'
import { decommissionRemoteMarkovd } from '../install/markovd-remote-decommission'
import { withManagedMarkovdLifecycle } from '../../ssh/markovd-runtime-maintenance'
import { collectManagedTerminalCensus } from '../../ssh/markovd-terminal-census-client'
import { RemoteInstallLockBusyError } from '../install/remote-install-lock'

type ManagedMarkovdStopPolicy = {
  isActiveEnvironment: (environmentId: string) => boolean
  retireLocalState: (environmentId: string) => Promise<void> | void
  /** Runs inside the host's lifecycle, so a Connect queued behind the unlink still wins. */
  releaseHostTransport: (sshTargetId: string) => Promise<void>
}

type Refusal = Extract<MarkovdManagedStopResult, { outcome: 'refused' }>
type Stopped = { version: string | null; retirement: MarkovdDaemonRetirementVerdict | null }

function refuse(verdict: Refusal['verdict'], code: string, reason: string): Refusal {
  return { outcome: 'refused', verdict, code, reason }
}

export function stopManagedMarkovdEnvironment(
  userDataPath: string,
  args: { selector: string; signal?: AbortSignal },
  policy: ManagedMarkovdStopPolicy
): Promise<MarkovdManagedStopResult> {
  return withManagedMarkovdLifecycle(userDataPath, args.selector, async (managed) => {
    const { environment, deployment } = managed
    if (policy.isActiveEnvironment(environment.id)) {
      return refuse(
        'live',
        'markovd_stop_active_environment',
        'This server is the default host for new projects. Choose another one under New projects open on before stopping it.'
      )
    }
    const stopped = await stopRemote(userDataPath, environment, deployment, args.signal)
    if ('outcome' in stopped) {
      return stopped
    }
    await unlinkEnvironmentLocally(userDataPath, environment, deployment, policy)
    return {
      outcome: 'unlinked',
      verdict: 'exited',
      environmentId: environment.id,
      sshTargetId: deployment.sshTargetId,
      stoppedVersion: stopped.version,
      retirement: stopped.retirement
    }
  })
}

/** Forget local state without assuming host exit; later connects may relink a still-running server. */
export function forgetManagedMarkovdEnvironment(
  userDataPath: string,
  args: { selector: string },
  policy: ManagedMarkovdStopPolicy
): Promise<MarkovdManagedForgetResult> {
  return withManagedMarkovdLifecycle(userDataPath, args.selector, (managed) =>
    forgetLinkedEnvironment(userDataPath, managed, policy)
  )
}

/** Forget one of two saved entries for one managed server; the other keeps managing it, so the host is not contacted. */
export function forgetRedundantManagedMarkovdEnvironment(
  userDataPath: string,
  args: { selector: string },
  policy: ManagedMarkovdStopPolicy
): Promise<MarkovdManagedForgetResult> {
  return withManagedMarkovdLifecycle(userDataPath, args.selector, (managed) => {
    // Checked in the queue and unlinked in the same tick, so two Removes cannot each count the other as the twin.
    if (!findManagedSshTwin(listEnvironments(userDataPath), managed.environment)) {
      return Promise.resolve(
        refuse(
          'live',
          'markovd_forget_no_managed_twin',
          'No other saved entry manages this server anymore, so removing this one would leave it unmanaged. Stop it instead.'
        )
      )
    }
    return forgetLinkedEnvironment(userDataPath, managed, policy)
  })
}

async function forgetLinkedEnvironment(
  userDataPath: string,
  {
    environment,
    deployment
  }: { environment: KnownRuntimeEnvironment; deployment: MarkovdSshDeploymentLink },
  policy: ManagedMarkovdStopPolicy
): Promise<MarkovdManagedForgetResult> {
  if (policy.isActiveEnvironment(environment.id)) {
    return refuse(
      'live',
      'markovd_forget_active_environment',
      'This server is the default host for new projects. Choose another one under New projects open on before forgetting it.'
    )
  }
  await unlinkEnvironmentLocally(userDataPath, environment, deployment, policy)
  return {
    outcome: 'forgotten',
    verdict: 'unverifiable',
    environmentId: environment.id,
    sshTargetId: deployment.sshTargetId
  }
}

async function stopRemote(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  deployment: MarkovdSshDeploymentLink,
  signal?: AbortSignal,
  retried = false
): Promise<Stopped | Refusal> {
  const context = await resolveLinkedMarkovdContext(environment, deployment, signal)
  const slot = managedMarkovdSlot(context, deployment.remotePort, signal)
  const transaction = await readMarkovdActivationTransaction(slot)
  if (transaction?.operation === 'decommission') {
    // Resume the exact interrupted stop from its journal.
    const recovered = await recoverInterruptedMarkovdActivation(slot)
    if (recovered.outcome === 'recovered' && recovered.activeVersion === null) {
      return { version: transaction.activeVersion, retirement: null }
    }
    if (recovered.outcome === 'refused') {
      return refuse(recovered.verdict, recovered.code, recovered.reason)
    }
    if (recovered.outcome === 'pending') {
      return refuse('unverifiable', recovered.code, recovered.reason)
    }
    // Another run may settle recovery first; restart from its resulting record.
    if (recovered.outcome === 'none') {
      return retried
        ? refuse(
            'unverifiable',
            'markovd_stop_journal_changed',
            'Another run on this server changed its stop while this one waited. Refresh and retry.'
          )
        : stopRemote(userDataPath, environment, deployment, signal, true)
    }
    return refuse(
      'live',
      'markovd_stop_withdrawn',
      'The interrupted stop was withdrawn and the server keeps serving. Stop it again.'
    )
  }
  if (transaction) {
    return refuse(
      'unverifiable',
      'markovd_activation_recovery_required',
      'An earlier update on this server was interrupted. Recover it before stopping.'
    )
  }
  const record = context.activationRecord
  if (!record.active) {
    return { version: null, retirement: null }
  }
  const census = await collectManagedTerminalCensus(userDataPath, environment, record)
  const result = await decommissionRemoteMarkovd({ ...slot, record, census })
  if (result.outcome === 'refused') {
    return refuse(result.verdict, result.code, result.reason)
  }
  return { version: result.version, retirement: result.retirement }
}

async function unlinkEnvironmentLocally(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  deployment: MarkovdSshDeploymentLink,
  policy: ManagedMarkovdStopPolicy
): Promise<void> {
  // Remove registration before releasing claims so crashes leave a resumable hidden target.
  removeManagedMarkovdEnvironment(userDataPath, environment.id)
  await policy.retireLocalState(environment.id)
  await closeMarkovdManagedTunnel(environment.id)
  const { claims } = requireManagedMarkovdInfrastructure()
  claims.releaseForUserRemoval(deployment.sshTargetId, environment.id)
  clearManagedMarkovdUpdateDeferral(environment.id)
  await claims.flush()
  // Clear journals after the fence; stale leftovers are recoverable on later conversion.
  removeMarkovdMigrationJournalsForDestination(userDataPath, deployment.sshTargetId, environment.id)
  // No server serves the host now, and an unserved host never stays connected.
  await policy.releaseHostTransport(deployment.sshTargetId)
}

export function cancelManagedMarkovdStop(
  userDataPath: string,
  args: { selector: string; signal?: AbortSignal }
): Promise<MarkovdManagedCancelStopResult> {
  return withManagedMarkovdLifecycle(userDataPath, args.selector, async (managed) => {
    const { environment, deployment } = managed
    const context = await resolveLinkedMarkovdContext(environment, deployment, args.signal)
    const slot = managedMarkovdSlot(context, deployment.remotePort, args.signal)
    let result: MarkovdManagedCancelStopResult
    try {
      result = await withStaleMarkovdActivationRecoveryLock(slot, async (lock) => {
        const transaction = await readMarkovdActivationTransaction(slot)
        if (transaction?.operation !== 'decommission') {
          if (transaction) {
            lock.retain()
          }
          return { outcome: 'none' }
        }
        if (transaction.phase === 'process-exited') {
          lock.retain()
          return { outcome: 'already-stopped' }
        }
        if (transaction.request) {
          const cancellation = await cancelRemoteMarkovdManagedStop(slot, transaction.request)
          if (cancellation.outcome !== 'canceled') {
            lock.retain()
            return {
              outcome: 'refused',
              verdict: 'live',
              code: 'markovd_stop_already_dispatched',
              reason:
                'markovd already acted on the stop and is shutting down; it cannot be canceled.'
            }
          }
        }
        const kept = await reconcileMarkovdDecommission(slot, {
          action: 'keep-serving',
          version: transaction.activeVersion
        })
        if (kept.outcome !== 'recovered' || !kept.activeVersion) {
          lock.retain()
          return {
            outcome: 'refused',
            verdict: 'unverifiable',
            code: 'markovd_stop_cancel_unverifiable',
            reason: 'The stop was withdrawn but the server could not be shown to be serving.'
          }
        }
        return { outcome: 'canceled', activeVersion: kept.activeVersion }
      })
    } catch (error) {
      if (error instanceof RemoteInstallLockBusyError) {
        return {
          outcome: 'refused',
          verdict: 'unverifiable',
          code: 'markovd_stop_still_running',
          reason: 'A stop on this server may still be running. Retry after it settles.'
        }
      }
      throw error
    }
    if (result.outcome === 'canceled') {
      await ensureMarkovdManagedTunnel(userDataPath, environment.id)
    }
    return result
  })
}
