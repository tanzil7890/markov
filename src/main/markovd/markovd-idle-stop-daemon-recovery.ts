// Cancelled idle stops may leave daemon admission closed. Replace only after atomic retirement
// agreement: replacement could otherwise kill the old daemon’s live sessions.
import { withTimeout } from '../../shared/promise-timeout-fallback'
import type { MarkovdDaemonRetirement } from './markovd-daemon-retirement'
import { MARKOVD_DAEMON_RETIREMENT_TIMEOUT_MS } from './markovd-stop-deadlines'

type RetirementOutcome = Pick<MarkovdDaemonRetirement, 'retirement' | 'lateRetirement'>

type MarkovdIdleStopDaemonRecoveryPorts = {
  admissionClosed: () => boolean
  /** Atomically recheck census and retirement fence in the daemon. */
  retireAgain: () => Promise<RetirementOutcome>
  replaceDaemon: () => Promise<unknown>
  timeoutMs?: number
}

export async function recoverDaemonAfterCancelledIdleStop(
  outcome: RetirementOutcome,
  ports: MarkovdIdleStopDaemonRecoveryPorts
): Promise<'serving' | 'unservable'> {
  const timeoutMs = ports.timeoutMs ?? MARKOVD_DAEMON_RETIREMENT_TIMEOUT_MS
  const retired = async (candidate: RetirementOutcome): Promise<boolean> =>
    candidate.retirement === 'retired' ||
    (candidate.lateRetirement !== undefined &&
      (await withTimeout(candidate.lateRetirement, timeoutMs, false)))
  if (!(await retired(outcome))) {
    if (!ports.admissionClosed()) {
      return 'serving'
    }
    // Only the daemon can resolve a lost retirement reply.
    const retry = await ports
      .retireAgain()
      .catch((): RetirementOutcome => ({ retirement: 'unverifiable' }))
    if (!(await retired(retry))) {
      if (ports.admissionClosed()) {
        console.error('[markovd] the terminal daemon may be retiring and did not settle it')
        return 'unservable'
      }
      return 'serving'
    }
  }
  try {
    await ports.replaceDaemon()
    console.error('[markovd] a client returned during idle stop; started a fresh terminal daemon')
    return 'serving'
  } catch (error) {
    console.error('[markovd] could not replace the retired terminal daemon:', error)
    return 'unservable'
  }
}
