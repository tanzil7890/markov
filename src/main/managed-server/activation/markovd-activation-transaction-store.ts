import {
  markovdActivationTransactionPath,
  parseMarkovdActivationTransaction,
  serializeMarkovdActivationTransaction,
  type MarkovdActivationTransaction
} from './markovd-activation-transaction'
import {
  readBoundedMarkovdRemoteRecord,
  writeAtomicMarkovdRemoteRecord
} from '../install/markovd-remote-record-file'
import type { MarkovdRemoteExecTarget } from '../install/markovd-remote-runtime-control'
import { currentMarkovdFence } from './markovd-activation-fence-scope'

const MARKOVD_ACTIVATION_TRANSACTION_MAX_BYTES = 64 * 1024

type MarkovdActivationTransactionStoreOptions = MarkovdRemoteExecTarget & { remoteHome: string }

/** Only verified absence returns null; unreadable journals retain the fence. */
export async function readMarkovdActivationTransaction(
  options: MarkovdActivationTransactionStoreOptions
): Promise<MarkovdActivationTransaction | null> {
  const read = await readBoundedMarkovdRemoteRecord(
    options,
    markovdActivationTransactionPath(options.host, options.remoteHome),
    MARKOVD_ACTIVATION_TRANSACTION_MAX_BYTES
  )
  const parsed = parseMarkovdActivationTransaction(read.state === 'present' ? read.raw : null)
  if (parsed.state === 'unreadable') {
    throw new Error(`Cannot read this host's markovd activation transaction: ${parsed.reason}`)
  }
  return parsed.state === 'ok' ? parsed.transaction : null
}

/** Stamp each write with its fence generation so release cannot delete another holder's journal. */
export function writeMarkovdActivationTransaction(
  options: MarkovdActivationTransactionStoreOptions,
  transaction: MarkovdActivationTransaction
): Promise<void> {
  const fenceToken = currentMarkovdFence()?.token
  return writeAtomicMarkovdRemoteRecord(
    options,
    markovdActivationTransactionPath(options.host, options.remoteHome),
    serializeMarkovdActivationTransaction(fenceToken ? { ...transaction, fenceToken } : transaction)
  )
}
