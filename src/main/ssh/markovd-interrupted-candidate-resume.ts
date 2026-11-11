/** Resume through the original readiness gate before undoing: the candidate may already serve changed state, and stopping it could require operator consent before anything can serve again. */
import type { ServeReadiness } from '../server/serve-readiness'
import { withActivatedVersion } from '../managed-server/activation/markovd-activation-record'
import { writeMarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record-store'
import type { MarkovdActivateTransaction } from '../managed-server/activation/markovd-activation-transaction'
import { writeMarkovdActivationTransaction } from '../managed-server/activation/markovd-activation-transaction-store'
import { withMarkovdActivationCandidateReady } from '../managed-server/activation/markovd-activation-transaction-transitions'
import { MarkovdActiveReadinessError } from './markovd-active-readiness'
import { markovdLivenessProvenExited } from '../managed-server/install/markovd-remote-launch'
import {
  MARKOVD_RECOVERY_CHANGED_STATE_CODE,
  type MarkovdManagedRefusal
} from '../../shared/markovd-managed-runtime'
import {
  ensureMarkovdSlotServing,
  markovdSlotDir,
  resolveMarkovdSlotIdentity,
  slotLiveness
} from './markovd-recovery-slot'
import type { MarkovdIncumbentRecoveryOptions } from './markovd-incumbent-recovery'
import { isMarkovdLaunchFailure } from './markovd-launch-failure'

/** Under the held fence, return null (or the candidate's launch failure) for undo; a refusal leaves the host untouched for an operator. */
export async function resumeInterruptedMarkovdCandidate(
  options: MarkovdIncumbentRecoveryOptions,
  transaction: MarkovdActivateTransaction
): Promise<ServeReadiness | MarkovdManagedRefusal | { launchFailure: Error } | null> {
  const snapshotState = transaction.snapshot.state
  const incumbent = transaction.recordBefore.active
  if (
    transaction.phase !== 'snapshot-captured' ||
    snapshotState === 'pending' ||
    // A serving incumbent holds the port and instance lock; undo keeps it.
    (incumbent !== null &&
      !markovdLivenessProvenExited(await slotLiveness(options, markovdSlotDir(options, incumbent))))
  ) {
    return null
  }
  const candidate = await resolveMarkovdSlotIdentity(options, transaction.candidateVersion)
  const candidateLiveness = await slotLiveness(options, candidate.remoteDir)
  // Old journals lack candidate app version, so commit would drop downgrade protection; undo a possibly serving candidate only with consent.
  if (transaction.candidateAppVersion === undefined) {
    if (markovdLivenessProvenExited(candidateLiveness) || options.acceptChangedState) {
      return null
    }
    if (candidateLiveness === 'UNKNOWN') {
      throw new Error(`Could not tell whether markovd ${transaction.candidateVersion} is running.`)
    }
    return {
      outcome: 'refused',
      verdict: 'live',
      code: MARKOVD_RECOVERY_CHANGED_STATE_CODE,
      reason:
        `An older Markov left version ${transaction.candidateVersion} running without finishing ` +
        'its update, and did not record which app started it, so it was neither committed nor ' +
        'stopped. Recover to stop it, restore the prelaunch snapshot and restart the previous ' +
        'build; what it changed is discarded.'
    }
  }
  // Undo must rule out an unprovable candidate before starting another slot.
  if (candidateLiveness === 'UNKNOWN') {
    return null
  }
  let readiness: ServeReadiness
  try {
    readiness = await ensureMarkovdSlotServing(options, candidate)
  } catch (error) {
    // Only candidate evidence permits undo; unanswered hosts retain the fence.
    if (error instanceof MarkovdActiveReadinessError && error.verdict !== 'unverifiable') {
      // Undo still follows; the failed candidate launch is a failed run all the same.
      return isMarkovdLaunchFailure(error) ? { launchFailure: error } : null
    }
    throw error
  }
  const now = new Date()
  const recordAfter = withActivatedVersion(
    transaction.recordBefore,
    transaction.candidateVersion,
    snapshotState === 'captured'
      ? {
          dirName: transaction.snapshot.dirName,
          takenBeforeVersion: transaction.candidateVersion,
          readableByVersion: incumbent,
          takenAt: transaction.startedAt
        }
      : null,
    now,
    transaction.candidateAppVersion ?? undefined
  )
  await writeMarkovdActivationTransaction(
    options,
    withMarkovdActivationCandidateReady(transaction, recordAfter, now)
  )
  await writeMarkovdActivationRecord(options, recordAfter)
  return readiness
}
