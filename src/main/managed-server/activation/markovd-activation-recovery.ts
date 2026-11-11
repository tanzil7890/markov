// Reconcile interrupted transactions to the recorded slot and state; retain the fence whenever ownership remains unproven.
import type { ServeReadiness } from '../../server/serve-readiness'
import {
  planMarkovdTransactionRecovery,
  type MarkovdActivationTransaction
} from './markovd-activation-transaction'
import { readMarkovdActivationTransaction } from './markovd-activation-transaction-store'
import {
  readMarkovdActivationRecord,
  writeMarkovdActivationRecord
} from './markovd-activation-record-store'
import {
  markovdActivationFenceExists,
  withStaleMarkovdActivationRecoveryLock
} from './markovd-activation-lock'
import { RemoteInstallLockBusyError } from '../install/remote-install-lock'
import {
  ensureMarkovdSlotServing,
  resolveMarkovdSlotIdentity
} from '../../ssh/markovd-recovery-slot'
import { reconcileMarkovdDecommission } from '../lifecycle/markovd-decommission-recovery'
import {
  recoverMarkovdIncumbent,
  type MarkovdIncumbentRecoveryOptions
} from '../../ssh/markovd-incumbent-recovery'
import type { MarkovdManagedRefusal } from '../../../shared/markovd-managed-runtime'
import { resumeInterruptedMarkovdCandidate } from '../../ssh/markovd-interrupted-candidate-resume'
import { errorMessage } from '../../../shared/error-message'
import { isMarkovdLaunchFailure } from '../../ssh/markovd-launch-failure'

export type MarkovdActivationRecoveryResult =
  | { outcome: 'none' }
  | { outcome: 'pending'; code: string; reason: string }
  | {
      outcome: 'recovered'
      resolution: 'committed' | 'restored-incumbent'
      activeVersion: string | null
      readiness: ServeReadiness | null
    }
  /** A launch failure behind an unverifiable refusal still ended a run. */
  | (MarkovdManagedRefusal & { launchFailure?: Error })

type MarkovdActivationRecoveryOptions = MarkovdIncumbentRecoveryOptions

export const MARKOVD_RECOVERY_UNVERIFIABLE_CODE = 'markovd_recovery_unverifiable'

/** Both pre-fence answers, read moments ago on this connect; they only skip the same two reads. */
export type MarkovdActivationIdlePreRead = { transactionAbsent: boolean; fenceOpen: boolean }

export async function recoverInterruptedMarkovdActivation(
  options: MarkovdActivationRecoveryOptions,
  preRead?: MarkovdActivationIdlePreRead
): Promise<MarkovdActivationRecoveryResult> {
  if (preRead?.transactionAbsent && preRead.fenceOpen) {
    return { outcome: 'none' }
  }
  try {
    if (
      !(await readMarkovdActivationTransaction(options)) &&
      !(await markovdActivationFenceExists(options))
    ) {
      return { outcome: 'none' }
    }
    return await withStaleMarkovdActivationRecoveryLock(options, async (lock) => {
      const transaction = await readMarkovdActivationTransaction(options)
      if (!transaction) {
        // Interrupted release can remove the journal before the fence; finishing release is enough.
        return { outcome: 'none' }
      }
      const result = await reconcileMarkovdTransaction(options, transaction)
      if (result.outcome !== 'recovered') {
        lock.retain()
      }
      return result
    })
  } catch (error) {
    if (error instanceof RemoteInstallLockBusyError) {
      return {
        outcome: 'pending',
        code: 'markovd_recovery_transaction_still_fresh',
        reason:
          'The activation fence is held by a run that may still be working. Retry after the ' +
          'install lock recovery window.'
      }
    }
    return {
      outcome: 'refused',
      verdict: 'unverifiable',
      code: MARKOVD_RECOVERY_UNVERIFIABLE_CODE,
      reason:
        `The interrupted activation could not be reconciled safely: ${errorMessage(error)} ` +
        'The host remains fenced.',
      ...(isMarkovdLaunchFailure(error) ? { launchFailure: error } : {})
    }
  }
}

/** Requires a held fence; unverifiable steps throw to preserve it. */
async function reconcileMarkovdTransaction(
  options: MarkovdActivationRecoveryOptions,
  transaction: MarkovdActivationTransaction
): Promise<MarkovdActivationRecoveryResult> {
  const plan = planMarkovdTransactionRecovery(
    transaction,
    await readMarkovdActivationRecord(options)
  )
  if (plan.action === 'refuse') {
    return { outcome: 'refused', verdict: 'unverifiable', code: plan.code, reason: plan.reason }
  }
  if (
    plan.action === 'confirm-decommissioned' ||
    plan.action === 'resume-stop' ||
    plan.action === 'keep-serving'
  ) {
    return reconcileMarkovdDecommission(options, plan)
  }
  if (plan.action === 'finish-commit') {
    await writeMarkovdActivationRecord(options, plan.record)
  }
  if (plan.action === 'stabilize-committed' || plan.action === 'finish-commit') {
    const activeVersion = plan.action === 'finish-commit' ? plan.record.active : plan.activeVersion
    if (!activeVersion) {
      throw new Error('The committed activation record has no active version.')
    }
    const identity = await resolveMarkovdSlotIdentity(options, activeVersion)
    return {
      outcome: 'recovered',
      resolution: 'committed',
      activeVersion,
      readiness: await ensureMarkovdSlotServing(options, identity)
    }
  }
  let launchFailure: Error | undefined
  if (transaction.operation === 'activate' && plan.launchedVersion) {
    const readiness = await resumeInterruptedMarkovdCandidate(options, transaction)
    if (readiness && 'outcome' in readiness) {
      return readiness
    }
    if (readiness && 'launchFailure' in readiness) {
      launchFailure = readiness.launchFailure
    } else if (readiness) {
      return {
        outcome: 'recovered',
        resolution: 'committed',
        activeVersion: transaction.candidateVersion,
        readiness
      }
    }
  }
  const recovery = await recoverMarkovdIncumbent(options, {
    transactionStartedAt: transaction.startedAt,
    launchedVersion: plan.launchedVersion,
    incumbent: plan.activeVersion
      ? await resolveMarkovdSlotIdentity(options, plan.activeVersion)
      : null,
    restoreState: plan.restoreState,
    launchedFromState: plan.launchedFromState
  })
  return recovery.outcome === 'refused'
    ? { ...recovery, ...(launchFailure ? { launchFailure } : {}) }
    : {
        outcome: 'recovered',
        resolution: 'restored-incumbent',
        activeVersion: plan.activeVersion,
        readiness: recovery.readiness
      }
}
