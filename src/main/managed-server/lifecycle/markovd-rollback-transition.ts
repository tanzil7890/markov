import { markovdRemoteBaseDir } from '../install/markovd-remote-windows-node'
import { randomUUID } from 'node:crypto'
import type {
  MarkovdRollbackOptions,
  MarkovdRollbackResult
} from '../install/markovd-remote-rollback'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import { withRolledBackVersion } from '../activation/markovd-activation-record'
import { writeMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import { launchAndJudgeMarkovdSlot } from '../../ssh/markovd-candidate-launch-verdict'
import { assessMarkovdRollback } from '../../ssh/markovd-update-plan'
import { MARKOVD_LOG_FILENAME } from '../install/markovd-remote-host-support'
import {
  captureMarkovdStateSnapshotCommand,
  markovdRollbackRescueDirName,
  parseMarkovdSnapshotCapture,
  parseMarkovdSnapshotPresence,
  parseMarkovdSnapshotRestore,
  probeMarkovdStateSnapshotCommand,
  restoreMarkovdStateSnapshotCommand
} from '../host-state/markovd-state-snapshot'
import {
  newestStateMtimeCommand,
  parseNewestStateMtimeSeconds
} from '../host-state/markovd-state-newest-mtime'
import { joinRemotePath } from '../../ssh/ssh-remote-platform'
import type { MarkovdActivationLockControl } from '../activation/markovd-activation-lock'
import {
  rollbackStartingState,
  type MarkovdRollbackTransaction
} from '../activation/markovd-activation-transaction'
import {
  createMarkovdRollbackTransaction,
  withMarkovdRollbackPhase,
  withMarkovdRollbackRescue
} from '../activation/markovd-activation-transaction-transitions'
import { writeMarkovdActivationTransaction } from '../activation/markovd-activation-transaction-store'
import { ROLLBACK_STALE_COUNT, rollbackRecountRefusal } from './markovd-rollback-admission'
import { runFencedStop } from '../../ssh/markovd-fenced-stop'
import { execMarkovdRemoteOr, withoutAbortSignal } from '../install/markovd-remote-runtime-control'
import { execMarkovdStateMutationOr } from '../host-state/markovd-state-mutation-exec'
import {
  markovdSlotDir,
  resolveMarkovdSlotIdentity,
  type MarkovdSlotIdentity
} from '../../ssh/markovd-recovery-slot'
import { markovdSnapshotPath } from '../../ssh/markovd-incumbent-recovery'
import {
  putTransactionIncumbentBack,
  restoreAfterRejectedCandidate
} from '../../ssh/markovd-transaction-incumbent'
import {
  readMarkovdRollbackBarrierTarget,
  rollbackBarrierRefusal,
  stopIncumbentBehindTerminalBarrier
} from './markovd-rollback-terminal-barrier'
import { withMarkovdLogTail } from '../install/markovd-remote-log-tail'
import { errorMessage } from '../../../shared/error-message'

async function stateWritesSinceActivation(
  options: MarkovdRollbackOptions
): Promise<boolean | null> {
  const activatedAtSeconds = Math.floor(Date.parse(options.record.activatedAt ?? '') / 1000)
  if (!Number.isFinite(activatedAtSeconds)) {
    return null
  }
  const newest = parseNewestStateMtimeSeconds(
    await execMarkovdRemoteOr(
      options,
      newestStateMtimeCommand(
        options.host,
        options.userDataDir,
        markovdRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  return newest === null ? null : newest >= activatedAtSeconds
}

export async function rollbackMarkovdLocked(
  options: MarkovdRollbackOptions,
  lock: MarkovdActivationLockControl
): Promise<MarkovdRollbackResult> {
  const now = options.now ?? ((): Date => new Date())
  const snapshot = options.record.snapshot
  const presence = snapshot
    ? parseMarkovdSnapshotPresence(
        await execMarkovdRemoteOr(
          options,
          probeMarkovdStateSnapshotCommand(
            options.host,
            markovdSnapshotPath(options, snapshot.dirName),
            markovdRemoteBaseDir(options.host, options.remoteHome)
          )
        )
      )
    : 'absent'
  const safety = assessMarkovdRollback({
    record: options.record,
    snapshotPresent: presence === 'unverifiable' ? null : presence === 'present',
    census: options.census,
    targetDaemonProtocol: options.targetDaemonProtocol,
    stateWritesSinceActivation: await stateWritesSinceActivation(options)
  })
  if (safety.safety === 'unsafe') {
    return { outcome: 'refused', code: safety.code, reason: safety.reason }
  }
  if (!snapshot || !options.record.active) {
    return {
      outcome: 'refused',
      code: 'markovd_rollback_no_active',
      reason: 'No markovd version is active on this host, so there is nothing to roll back from.'
    }
  }
  let incumbent: MarkovdSlotIdentity
  try {
    incumbent = await resolveMarkovdSlotIdentity(options, options.record.active)
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return {
      outcome: 'refused',
      code: 'markovd_rollback_active_identity_unverifiable',
      reason: `The active markovd identity could not be verified: ${errorMessage(error)} Nothing was changed.`
    }
  }

  const barrierTarget = await readMarkovdRollbackBarrierTarget(options, incumbent.version)
  if (barrierTarget.state === 'refused') {
    return { outcome: 'refused', code: barrierTarget.code, reason: barrierTarget.reason }
  }
  const startedAt = now()
  let transaction: MarkovdRollbackTransaction = createMarkovdRollbackTransaction({
    transactionId: randomUUID(),
    incumbentVersion: incumbent.version,
    targetVersion: safety.target,
    recordBefore: options.record,
    recordAfter: withRolledBackVersion(options.record, startedAt),
    rescueDirName: markovdRollbackRescueDirName(incumbent.version, startedAt.getTime()),
    now: startedAt
  })
  const fenced = await runFencedStop({
    recountCensus: options.recountCensus,
    releaseIncumbentAdmission: options.releaseIncumbentAdmission,
    now: () => now().getTime(),
    refuse: rollbackRecountRefusal,
    prepare: () => writeMarkovdActivationTransaction(options, transaction),
    stale: () => ROLLBACK_STALE_COUNT,
    stop: async () => {
      lock.retainOnError()
      // Cancellation after mutation could strand a stopped host; finish or recover instead.
      options = withoutAbortSignal(options)
      // Pre-lock census can go stale; the fenced stop supplies the terminal-safety proof.
      return stopIncumbentBehindTerminalBarrier(
        options,
        transaction.transactionId,
        barrierTarget.context
      )
    },
    // Withdrawn stops leave the incumbent serving and needing admission reopened.
    stopMayHaveBeenSent: (barrier) => barrier.state !== 'withdrawn'
  })
  if ('refused' in fenced) {
    return fenced.refused
  }
  const blocked = rollbackBarrierRefusal(fenced.stopped)
  if (blocked) {
    if (blocked.retainFence) {
      lock.retain()
    }
    const recovered = blocked.restartIncumbent
      ? ` ${await putIncumbentBack(options, lock, transaction, incumbent)}`
      : ''
    return { outcome: blocked.outcome, code: blocked.code, reason: blocked.reason + recovered }
  }
  transaction = withMarkovdRollbackPhase(transaction, 'incumbent-stopped', now())
  await writeMarkovdActivationTransaction(options, transaction)

  const rescue = parseMarkovdSnapshotCapture(
    await execMarkovdStateMutationOr(
      options,
      captureMarkovdStateSnapshotCommand(
        options.host,
        options.userDataDir,
        markovdSnapshotPath(options, transaction.rescue.dirName),
        markovdRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  if (rescue === 'failed') {
    const recovered = await putIncumbentBack(options, lock, transaction, incumbent)
    return {
      outcome: 'failed',
      code: 'markovd_rollback_rescue_snapshot_failed',
      reason:
        'The current state could not be preserved in a rescue snapshot, so the data root was ' +
        `not replaced. ${recovered}`
    }
  }
  transaction = withMarkovdRollbackRescue(transaction, rescue, now())
  await writeMarkovdActivationTransaction(options, transaction)

  // Restore before launching: older builds must never load newer state.
  const restored = parseMarkovdSnapshotRestore(
    await execMarkovdStateMutationOr(
      options,
      restoreMarkovdStateSnapshotCommand(
        options.host,
        options.userDataDir,
        markovdSnapshotPath(options, snapshot.dirName),
        markovdRemoteBaseDir(options.host, options.remoteHome)
      )
    )
  )
  if (restored !== 'restored') {
    const recovered = await putIncumbentBack(options, lock, transaction, incumbent)
    return {
      outcome: 'failed',
      code: 'markovd_rollback_restore_failed',
      reason: `The pre-activation snapshot could not be restored (${restored}). ${recovered}`
    }
  }
  transaction = withMarkovdRollbackPhase(transaction, 'rollback-state-restored', now())
  await writeMarkovdActivationTransaction(options, transaction)

  const targetDir = markovdSlotDir(options, safety.target)
  const { verdict, launchError } = await launchAndJudgeMarkovdSlot(options, {
    remoteInstallDir: targetDir,
    fullVersion: safety.target,
    buildHash: options.targetBuildHash
  })
  if (verdict.decision === 'reject') {
    const reason =
      launchError === undefined
        ? verdict.reason
        : `It failed while starting: ${errorMessage(launchError)}`
    const recovered = await restoreAfterRejectedCandidate(options, lock, {
      launchedDir: targetDir,
      launchedVersion: safety.target,
      transactionStartedAt: transaction.startedAt,
      incumbent,
      restoreState: rescueVerdict(transaction),
      launchedFromState: rollbackStartingState(transaction)
    })
    return {
      outcome: 'failed',
      code: launchError === undefined ? verdict.code : 'markovd_rollback_target_launch_failed',
      reason: await withMarkovdLogTail(
        options,
        targetDir,
        `The rollback target ${safety.target} did not come up healthy: ${reason} ${recovered} ` +
          `Its stderr is at ${joinRemotePath(options.host, targetDir, MARKOVD_LOG_FILENAME)}.`
      )
    }
  }

  // Until target readiness is proven, active must still identify the recoverable incumbent.
  transaction = withMarkovdRollbackPhase(transaction, 'target-ready', now())
  await writeMarkovdActivationTransaction(options, transaction)
  await writeMarkovdActivationRecord(options, transaction.recordAfter)
  return {
    outcome: 'rolled-back',
    target: safety.target,
    discarded: safety.safety === 'lossy' ? safety.discards : [],
    verdict
  }
}

type RestoreState = Parameters<typeof putTransactionIncumbentBack>[2]['restoreState']

function rescueVerdict(transaction: MarkovdRollbackTransaction): RestoreState {
  return transaction.rescue.state === 'pending' ? null : transaction.rescue
}

async function putIncumbentBack(
  options: MarkovdRollbackOptions,
  lock: MarkovdActivationLockControl,
  transaction: MarkovdRollbackTransaction,
  incumbent: MarkovdSlotIdentity
): Promise<string> {
  const failure = await putTransactionIncumbentBack(options, lock, {
    transactionStartedAt: transaction.startedAt,
    launchedVersion: null,
    incumbent,
    restoreState: rescueVerdict(transaction)
  })
  return failure ?? `markovd ${incumbent.version} was restored and is serving again.`
}
