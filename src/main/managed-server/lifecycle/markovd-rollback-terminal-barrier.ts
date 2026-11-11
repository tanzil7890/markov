// Pre-stop census can go stale; only fenced idle-daemon retirement proves snapshot replacement safe.
import {
  readRemoteMarkovdManagedStopTarget,
  type MarkovdManagedStopTarget
} from './markovd-managed-remote-stop'
import { settleMarkovdDecommissionStop } from './markovd-decommission-stop'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import type { MarkovdManagedStopContext } from '../../../shared/markovd-stop-request'

type MarkovdRollbackBarrier =
  | { state: 'retired' }
  | { state: 'withdrawn'; reason: string }
  /** Stop underway or unconfirmed; retain the fence. */
  | { state: 'unsettled'; reason: string }
  /** Exit without proof of idle terminals requires restarting the incumbent. */
  | { state: 'unproven'; reason: string }

export async function readMarkovdRollbackBarrierTarget(
  options: MarkovdSlotOptions,
  version: string
): Promise<MarkovdManagedStopTarget> {
  const target = await readRemoteMarkovdManagedStopTarget(options, version)
  return target.state === 'ready'
    ? target
    : {
        ...target,
        code: 'markovd_rollback_terminal_barrier_unavailable',
        reason:
          `${target.reason} A rollback needs markovd to prove no terminal runs at its stop; ` +
          'nothing was changed.'
      }
}

export async function stopIncumbentBehindTerminalBarrier(
  options: MarkovdSlotOptions,
  transactionId: string,
  context: MarkovdManagedStopContext
): Promise<MarkovdRollbackBarrier> {
  const settlement = await settleMarkovdDecommissionStop(options, {
    schemaVersion: 1,
    transactionId,
    ...context,
    retireIdleDaemon: true
  })
  if (settlement.state === 'withdrawn' || settlement.state === 'unsettled') {
    return { state: settlement.state, reason: settlement.reason }
  }
  if (settlement.retirement === 'retired') {
    return { state: 'retired' }
  }
  return {
    state: 'unproven',
    reason:
      `markovd ${context.version} stopped, but its terminal daemon reported ` +
      `${settlement.retirement} work at the stop, so the older snapshot was not restored.`
  }
}

type MarkovdRollbackBarrierRefusal = {
  outcome: 'refused' | 'failed'
  code: string
  reason: string
  retainFence: boolean
  restartIncumbent: boolean
}

/** Only retired daemons permit replacing current state with an older snapshot. */
export function rollbackBarrierRefusal(
  barrier: MarkovdRollbackBarrier
): MarkovdRollbackBarrierRefusal | null {
  switch (barrier.state) {
    case 'retired':
      return null
    case 'withdrawn':
      return {
        outcome: 'failed',
        code: 'markovd_rollback_stop_withdrawn',
        reason: barrier.reason,
        retainFence: false,
        restartIncumbent: false
      }
    case 'unsettled':
      return {
        outcome: 'failed',
        code: 'markovd_rollback_stop_incomplete',
        reason: `${barrier.reason} Nothing was restored.`,
        retainFence: true,
        restartIncumbent: false
      }
    case 'unproven':
      return {
        outcome: 'refused',
        code: 'markovd_rollback_terminals_at_stop',
        reason: barrier.reason,
        retainFence: false,
        restartIncumbent: true
      }
  }
}
