// Lost stop answers are unverifiable; only confirmed exit or cancellation releases the fence.
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import {
  cancelRemoteMarkovdManagedStop,
  completeRemoteMarkovdManagedStop
} from './markovd-managed-remote-stop'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import type {
  MarkovdDaemonRetirementVerdict,
  MarkovdManagedStopRequest
} from '../../../shared/markovd-stop-request'
import { errorMessage } from '../../../shared/error-message'

type MarkovdDecommissionStopSettlement =
  | { state: 'exited'; retirement: MarkovdDaemonRetirementVerdict }
  /** Confirmed cancellation leaves the incumbent serving. */
  | { state: 'withdrawn'; verdict: 'live' | 'unverifiable'; reason: string }
  /** Stop underway or unconfirmed; retain the fence. */
  | { state: 'unsettled'; verdict: 'live' | 'unverifiable'; reason: string }

export async function settleMarkovdDecommissionStop(
  options: MarkovdSlotOptions,
  request: MarkovdManagedStopRequest
): Promise<MarkovdDecommissionStopSettlement> {
  let verdict: 'live' | 'unverifiable'
  let reason: string
  try {
    const completion = await completeRemoteMarkovdManagedStop(options, request)
    if (completion.verdict === 'exited') {
      // A completion without a recorded outcome proves exit but not retirement.
      return { state: 'exited', retirement: completion.retirement ?? 'unverifiable' }
    }
    verdict = completion.verdict
    reason = `markovd ${request.version} did not exit (${completion.verdict}).`
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    verdict = 'unverifiable'
    reason = `The host gave no verifiable stop verdict: ${errorMessage(error)}`
  }
  try {
    const cancellation = await cancelRemoteMarkovdManagedStop(options, request)
    if (cancellation.outcome === 'canceled') {
      return {
        state: 'withdrawn',
        verdict,
        reason: `${reason} The stop request was withdrawn; markovd keeps serving.`
      }
    }
    return {
      state: 'unsettled',
      verdict: 'live',
      reason: `${reason} markovd already acted on the request and is still stopping.`
    }
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return {
      state: 'unsettled',
      verdict: 'unverifiable',
      reason: `${reason} Withdrawing the request gave no verifiable answer: ${errorMessage(error)}`
    }
  }
}
