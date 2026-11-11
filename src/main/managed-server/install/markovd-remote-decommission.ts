// Journal instance-bound stop under the activation fence; refuse live/unknown terminal census and deactivate only after proven exit.
import { randomUUID } from 'node:crypto'
import type { MarkovdActivationRecord } from '../activation/markovd-activation-record'
import {
  readMarkovdActivationRecord,
  writeMarkovdActivationRecord
} from '../activation/markovd-activation-record-store'
import { sameMarkovdActivationRecord } from '../activation/markovd-activation-transaction'
import { writeMarkovdActivationTransaction } from '../activation/markovd-activation-transaction-store'
import { withMarkovdActivationLock } from '../activation/markovd-activation-lock'
import { markovdActivationFenceRefusal } from '../activation/markovd-activation-fence-hold'
import {
  committedMarkovdDecommissionRecord,
  createMarkovdDecommissionTransaction,
  withMarkovdDecommissionProcessExited,
  withMarkovdDecommissionStopDispatched
} from '../lifecycle/markovd-decommission-transaction'
import { readRemoteMarkovdManagedStopTarget } from '../lifecycle/markovd-managed-remote-stop'
import { settleMarkovdDecommissionStop } from '../lifecycle/markovd-decommission-stop'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import type { MarkovdDecommissionResult } from '../../../shared/markovd-decommission'
import type { MarkovdTerminalCensus } from '../../../shared/markovd-terminal-census'

type MarkovdDecommissionOptions = MarkovdSlotOptions & {
  /** Refuse if the host record changed since caller review. */
  record: MarkovdActivationRecord
  /** Fresh census must prove no live or uncounted terminals. */
  census: MarkovdTerminalCensus
  now?: () => Date
}

type Refusal = Extract<MarkovdDecommissionResult, { outcome: 'refused' }>

function refuse(verdict: Refusal['verdict'], code: string, reason: string): Refusal {
  return { outcome: 'refused', verdict, code, reason }
}

function censusRefusal(census: MarkovdTerminalCensus): Refusal | null {
  if (census.liveSessions === null) {
    return refuse(
      'unverifiable',
      'markovd_decommission_census_unavailable',
      'The terminal daemon did not answer a session count, so decommissioning could end ' +
        'running work. Retry when the host answers.'
    )
  }
  if (census.liveSessions > 0) {
    return refuse(
      'live',
      'markovd_decommission_terminals_running',
      `${census.liveSessions} terminal${census.liveSessions === 1 ? ' is' : 's are'} still ` +
        'running on this host. Close them before decommissioning the server.'
    )
  }
  return null
}

export async function decommissionRemoteMarkovd(
  options: MarkovdDecommissionOptions
): Promise<MarkovdDecommissionResult> {
  const now = options.now ?? ((): Date => new Date())
  return withMarkovdActivationLock(
    options,
    async (lock) => {
      const record = await readMarkovdActivationRecord(options)
      if (!sameMarkovdActivationRecord(record, options.record)) {
        return refuse(
          'unverifiable',
          'markovd_decommission_record_changed',
          'The host activation record changed since it was reviewed. Refresh and try again.'
        )
      }
      const activeVersion = record.active
      if (!activeVersion) {
        return refuse(
          'unverifiable',
          'markovd_decommission_nothing_active',
          'No markovd version is active on this host, so there is nothing to decommission.'
        )
      }
      const census = censusRefusal(options.census)
      if (census) {
        return census
      }
      const target = await readRemoteMarkovdManagedStopTarget(options, activeVersion)
      if (target.state === 'refused') {
        return refuse(target.verdict, target.code, target.reason)
      }

      let transaction = createMarkovdDecommissionTransaction({
        transactionId: randomUUID(),
        recordBefore: { ...record, active: activeVersion },
        now: now()
      })
      await writeMarkovdActivationTransaction(options, transaction)
      lock.retainOnError()
      const request = {
        schemaVersion: 1 as const,
        transactionId: transaction.transactionId,
        ...target.context,
        // Idle daemon retirement is best-effort; busy daemons retain their terminals.
        retireIdleDaemon: true as const
      }
      // Journal exact stop intent before dispatch so recovery can settle the same request.
      transaction = withMarkovdDecommissionStopDispatched(transaction, request, now())
      await writeMarkovdActivationTransaction(options, transaction)

      const settlement = await settleMarkovdDecommissionStop(options, request)
      if (settlement.state === 'withdrawn') {
        return refuse(settlement.verdict, 'markovd_decommission_stop_withdrawn', settlement.reason)
      }
      if (settlement.state === 'unsettled') {
        lock.retain()
        return refuse(settlement.verdict, 'markovd_decommission_stop_unsettled', settlement.reason)
      }
      transaction = withMarkovdDecommissionProcessExited(transaction, now())
      await writeMarkovdActivationTransaction(options, transaction)
      await writeMarkovdActivationRecord(options, committedMarkovdDecommissionRecord(transaction))
      return {
        outcome: 'decommissioned',
        version: activeVersion,
        retirement: settlement.retirement
      }
    },
    async () => {
      const refusal = await markovdActivationFenceRefusal(options, 'stop')
      return refuse('unverifiable', refusal.code, refusal.reason)
    }
  )
}
