import type { MarkovdActivationLockControl } from '../managed-server/activation/markovd-activation-lock'
import type { MarkovdSnapshotVerdict } from '../managed-server/activation/markovd-activation-transaction'
import { markovdStopFreedTheHost } from '../managed-server/install/markovd-remote-process-control'
import { withoutAbortSignal } from '../managed-server/install/markovd-remote-runtime-control'
import {
  launchMarkovdSlot,
  stopMarkovdSlot,
  MARKOVD_SLOT_STOP_WAIT_SECONDS,
  type MarkovdSlotIdentity,
  type MarkovdSlotOptions
} from './markovd-recovery-slot'
import { recoverMarkovdIncumbent } from './markovd-incumbent-recovery'
import { errorMessage } from '../../shared/error-message'

/** Return null on proven exit; otherwise retain the fence when a delivered stop may still change the host. */
export async function stopTransactionIncumbent(
  options: MarkovdSlotOptions,
  incumbent: MarkovdSlotIdentity,
  lock: MarkovdActivationLockControl
): Promise<{ reason: string; stopMayBeUnderway: boolean } | null> {
  const stopped = await stopMarkovdSlot(options, incumbent.remoteDir, false)
  if (markovdStopFreedTheHost(stopped)) {
    return null
  }
  // Only a stop that may have been delivered can still change the host; otherwise nothing happened.
  const stopMayBeUnderway = stopped === 'still-running' || stopped === 'unconfirmed'
  if (stopMayBeUnderway) {
    lock.retain()
  }
  return {
    reason:
      `Could not verify that markovd ${incumbent.version} exited within ` +
      `${MARKOVD_SLOT_STOP_WAIT_SECONDS}s (${stopped}).`,
    stopMayBeUnderway
  }
}

export async function restartAfterSnapshotFailure(
  options: MarkovdSlotOptions,
  incumbent: MarkovdSlotIdentity,
  lock: MarkovdActivationLockControl
): Promise<string> {
  try {
    await launchMarkovdSlot(withoutAbortSignal(options), incumbent)
    lock.recovered()
    return `markovd ${incumbent.version} was restarted and is serving again.`
  } catch (error) {
    lock.retain()
    return `restarting markovd ${incumbent.version} failed: ${errorMessage(error)} This host requires recovery.`
  }
}

/** Restore changed state and incumbent only after both slots prove exit; refusal retains the fence. */
export async function putTransactionIncumbentBack(
  options: MarkovdSlotOptions,
  lock: MarkovdActivationLockControl,
  input: {
    transactionStartedAt: string
    launchedVersion: string | null
    incumbent: MarkovdSlotIdentity | null
    restoreState: MarkovdSnapshotVerdict | null
    launchedFromState?: MarkovdSnapshotVerdict | null
  }
): Promise<string | null> {
  try {
    const recovery = await recoverMarkovdIncumbent(withoutAbortSignal(options), {
      ...input,
      slotsProvenExited: true
    })
    if (recovery.outcome === 'refused') {
      lock.retain()
      return recovery.reason
    }
    lock.recovered()
    return null
  } catch (error) {
    lock.retain()
    return `Restoring the previous version failed: ${errorMessage(error)} This host requires recovery.`
  }
}

/** Stop the rejected candidate before safely restoring incumbent state. */
export async function restoreAfterRejectedCandidate(
  options: MarkovdSlotOptions,
  lock: MarkovdActivationLockControl,
  input: {
    launchedDir: string
    launchedVersion: string
    transactionStartedAt: string
    incumbent: MarkovdSlotIdentity | null
    restoreState: MarkovdSnapshotVerdict | null
    launchedFromState?: MarkovdSnapshotVerdict | null
  }
): Promise<string> {
  const { launchedDir, ...restore } = input
  const stopped = await stopMarkovdSlot(withoutAbortSignal(options), launchedDir, true).catch(
    (error: unknown) => `unverifiable: ${errorMessage(error)}`
  )
  if (stopped !== 'stopped' && stopped !== 'already-exited') {
    lock.retain()
    return (
      `markovd ${input.launchedVersion} could not be confirmed stopped (${stopped}), so nothing ` +
      'was restored over state it may still own. This host requires recovery.'
    )
  }
  const failure = await putTransactionIncumbentBack(options, lock, restore)
  return (
    failure ??
    (input.incumbent
      ? `markovd ${input.incumbent.version} was restarted and is serving again.`
      : 'No previous version was active, so this host is now serving nothing.')
  )
}
