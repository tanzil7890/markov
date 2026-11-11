import type { MarkovdActivationRecord } from './markovd-activation-record'
import { MARKOVD_ACTIVATION_TRANSACTION_SCHEMA_VERSION } from './markovd-activation-transaction-schema'
import type {
  MarkovdActivateTransaction,
  MarkovdRollbackTransaction
} from './markovd-activation-transaction'

export function createMarkovdActivationTransaction(options: {
  transactionId: string
  candidateVersion: string
  appVersion?: string
  recordBefore: MarkovdActivationRecord
  snapshotDirName: string
  now: Date
}): MarkovdActivateTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: MARKOVD_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'activate',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    candidateVersion: options.candidateVersion,
    candidateAppVersion: options.appVersion ?? null,
    recordBefore: options.recordBefore,
    recordAfter: null,
    snapshot: { dirName: options.snapshotDirName, state: 'pending' }
  }
}

export function withMarkovdActivationIncumbentStopped(
  transaction: MarkovdActivateTransaction,
  now: Date
): MarkovdActivateTransaction {
  return {
    ...transaction,
    phase: 'incumbent-stopped',
    updatedAt: now.toISOString()
  }
}

export function withMarkovdActivationSnapshot(
  transaction: MarkovdActivateTransaction,
  state: 'captured' | 'empty',
  now: Date
): MarkovdActivateTransaction {
  return {
    ...transaction,
    phase: 'snapshot-captured',
    updatedAt: now.toISOString(),
    snapshot: { dirName: transaction.snapshot.dirName, state }
  }
}

export function withMarkovdActivationCandidateReady(
  transaction: MarkovdActivateTransaction,
  recordAfter: MarkovdActivationRecord,
  now: Date
): MarkovdActivateTransaction {
  return {
    ...transaction,
    phase: 'candidate-ready',
    updatedAt: now.toISOString(),
    recordAfter
  }
}

export function createMarkovdRollbackTransaction(options: {
  transactionId: string
  incumbentVersion: string
  targetVersion: string
  recordBefore: MarkovdActivationRecord
  recordAfter: MarkovdActivationRecord
  rescueDirName: string
  now: Date
}): MarkovdRollbackTransaction {
  const timestamp = options.now.toISOString()
  return {
    schemaVersion: MARKOVD_ACTIVATION_TRANSACTION_SCHEMA_VERSION,
    transactionId: options.transactionId,
    operation: 'rollback',
    phase: 'prepared',
    startedAt: timestamp,
    updatedAt: timestamp,
    incumbentVersion: options.incumbentVersion,
    targetVersion: options.targetVersion,
    recordBefore: options.recordBefore,
    recordAfter: options.recordAfter,
    rescue: { dirName: options.rescueDirName, state: 'pending' }
  }
}

export function withMarkovdRollbackPhase(
  transaction: MarkovdRollbackTransaction,
  phase: 'incumbent-stopped' | 'rollback-state-restored' | 'target-ready',
  now: Date
): MarkovdRollbackTransaction {
  return { ...transaction, phase, updatedAt: now.toISOString() }
}

export function withMarkovdRollbackRescue(
  transaction: MarkovdRollbackTransaction,
  state: 'captured' | 'empty',
  now: Date
): MarkovdRollbackTransaction {
  return {
    ...transaction,
    phase: 'rescue-captured',
    updatedAt: now.toISOString(),
    rescue: { dirName: transaction.rescue.dirName, state }
  }
}
