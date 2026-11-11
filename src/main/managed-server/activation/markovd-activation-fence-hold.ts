/** Retry live fences later, clear abandoned bare fences, and require recovery for interrupted journaled state. */
import {
  markovdActivationFenceExists,
  withStaleMarkovdActivationRecoveryLock,
  type MarkovdActivationLockOptions
} from './markovd-activation-lock'
import { readMarkovdActivationTransaction } from './markovd-activation-transaction-store'
import { markovdActivationFenceLockDir } from './markovd-activation-transaction'
import { isRelayInstallLockStale } from '../install/remote-install-lock'
import { findExitedOwnLockToken } from '../../ssh/markovd-exited-own-lock'
import { markovdRemoteBaseDir } from '../install/markovd-remote-windows-node'

export const MARKOVD_ACTIVATION_FENCE_BUSY_CODE = 'markovd_activation_fence_busy'
const MARKOVD_ACTIVATION_RECOVERY_REQUIRED_CODE = 'markovd_activation_recovery_required'

type MarkovdActivationFenceRefusal = {
  code: string
  reason: string
  /** Bare stale fence cleared; the caller may retry immediately. */
  cleared?: true
}

export async function markovdActivationFenceRefusal(
  options: MarkovdActivationLockOptions,
  attempt: string
): Promise<MarkovdActivationFenceRefusal> {
  const lockDir = markovdActivationFenceLockDir(options.host, options.remoteHome)
  const journal = (await readMarkovdActivationTransaction(options).catch(() => null)) !== null
  const baseDir = markovdRemoteBaseDir(options.host, options.remoteHome)
  const stale =
    (await findExitedOwnLockToken(options, lockDir, { baseDir, guardsStateMutation: true })) !==
      null || (await isRelayInstallLockStale(options.conn, lockDir, options.host))
  if (stale && !journal && (await clearAbandonedFence(options))) {
    return {
      code: MARKOVD_ACTIVATION_FENCE_BUSY_CODE,
      reason: `An abandoned fence held this host and was cleared; the ${attempt} is retried.`,
      cleared: true
    }
  }
  const stuck =
    stale || (journal && !(await markovdActivationFenceExists(options).catch(() => true)))
  return stuck
    ? {
        code: MARKOVD_ACTIVATION_RECOVERY_REQUIRED_CODE,
        reason: `An interrupted update or stop holds this host, so the ${attempt} did not start. Recover it first.`
      }
    : {
        code: MARKOVD_ACTIVATION_FENCE_BUSY_CODE,
        reason: `Another run is changing this host’s Markov server, so the ${attempt} did not start. It is retried on a later connect.`
      }
}

/** Drop a stale fence only after rechecking under takeover that no journal appeared. */
async function clearAbandonedFence(options: MarkovdActivationLockOptions): Promise<boolean> {
  try {
    return await withStaleMarkovdActivationRecoveryLock(options, async (lock) => {
      if (await readMarkovdActivationTransaction(options)) {
        lock.retain()
        return false
      }
      return true
    })
  } catch {
    // Failed takeover leaves the fence intact for normal refusal classification.
    return false
  }
}
