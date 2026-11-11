// Only process-exited may commit; dispatched phases nest under prepared for released readers.
import {
  serializeMarkovdActivationRecord,
  withDeactivatedVersion,
  withDeactivatedVersionCommitted,
  type MarkovdActivationRecord
} from '../activation/markovd-activation-record'
import { MARKOVD_ACTIVATION_TRANSACTION_SCHEMA_VERSION } from '../activation/markovd-activation-transaction-schema'
import type { MarkovdManagedStopRequest } from '../../../shared/markovd-stop-request'

export type MarkovdDecommissionTransaction = {
  schemaVersion: typeof MARKOVD_ACTIVATION_TRANSACTION_SCHEMA_VERSION
  transactionId: string
  operation: 'decommission'
  phase: 'prepared' | 'stop-dispatched' | 'process-exited'
  startedAt: string
  updatedAt: string
  activeVersion: string
  recordBefore: MarkovdActivationRecord
  recordAfter: MarkovdActivationRecord
  request: MarkovdManagedStopRequest | null
}

/** Released desktops drop this field. */
type MarkovdDecommissionDispatch = {
  phase: 'stop-dispatched' | 'process-exited'
  request: MarkovdManagedStopRequest
}

type MarkovdDecommissionJournal = Omit<MarkovdDecommissionTransaction, 'phase' | 'request'> & {
  phase: 'prepared'
  request: null
  dispatched?: MarkovdDecommissionDispatch
}

export type MarkovdDecommissionRecoveryPlan =
  | { action: 'confirm-decommissioned'; version: string; record: MarkovdActivationRecord | null }
  /** Completion or cancellation must settle a possibly delivered request. */
  | { action: 'resume-stop'; request: MarkovdManagedStopRequest; record: MarkovdActivationRecord }
  | { action: 'keep-serving'; version: string }

export function createMarkovdDecommissionTransaction(options: {
  transactionId: string
  recordBefore: MarkovdActivationRecord & { active: string }
  now: Date
}): MarkovdDecommissionTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: MARKOVD_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'decommission',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    activeVersion: options.recordBefore.active,
    recordBefore: options.recordBefore,
    recordAfter: withDeactivatedVersion(options.recordBefore),
    request: null
  }
}

export function withMarkovdDecommissionStopDispatched(
  transaction: MarkovdDecommissionTransaction,
  request: MarkovdManagedStopRequest,
  now: Date
): MarkovdDecommissionTransaction {
  return { ...transaction, phase: 'stop-dispatched', updatedAt: now.toISOString(), request }
}

export function withMarkovdDecommissionProcessExited(
  transaction: MarkovdDecommissionTransaction,
  now: Date
): MarkovdDecommissionTransaction {
  return { ...transaction, phase: 'process-exited', updatedAt: now.toISOString() }
}

/** Keep top-level prepared so released readers relaunch the recorded build instead of downgrading.
 * Their parser drops dispatched; their completed-stop path loses activeAppVersion protection. */
export function markovdDecommissionJournal(
  transaction: MarkovdDecommissionTransaction
): MarkovdDecommissionJournal {
  const { phase, request, ...rest } = transaction
  return phase === 'prepared' || !request
    ? { ...rest, phase: 'prepared', request: null }
    : { ...rest, phase: 'prepared', request: null, dispatched: { phase, request } }
}

export function markovdDecommissionTransactionDefect(
  transaction: MarkovdDecommissionTransaction
): string | null {
  if (transaction.recordBefore.active !== transaction.activeVersion) {
    return 'decommission version does not match recordBefore'
  }
  if (
    serializeMarkovdActivationRecord(transaction.recordAfter) !==
    serializeMarkovdActivationRecord(withDeactivatedVersion(transaction.recordBefore))
  ) {
    return 'recordAfter is not the deactivated recordBefore'
  }
  if (transaction.request && transaction.request.version !== transaction.activeVersion) {
    return 'stop request names another version'
  }
  return null
}

export function planMarkovdDecommissionRecovery(
  transaction: MarkovdDecommissionTransaction,
  committed: boolean
): MarkovdDecommissionRecoveryPlan {
  if (committed) {
    return { action: 'confirm-decommissioned', version: transaction.activeVersion, record: null }
  }
  if (transaction.phase === 'process-exited') {
    return {
      action: 'confirm-decommissioned',
      version: transaction.activeVersion,
      record: committedMarkovdDecommissionRecord(transaction)
    }
  }
  if (transaction.phase === 'stop-dispatched' && transaction.request) {
    return {
      action: 'resume-stop',
      request: transaction.request,
      record: committedMarkovdDecommissionRecord(transaction)
    }
  }
  return { action: 'keep-serving', version: transaction.activeVersion }
}

/** Preserve advisory fields alongside the journaled recordAfter. */
export function committedMarkovdDecommissionRecord(
  transaction: MarkovdDecommissionTransaction
): MarkovdActivationRecord {
  return withDeactivatedVersionCommitted(transaction.recordBefore)
}
