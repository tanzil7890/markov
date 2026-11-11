/** Pin every journaled slot needed for recovery. An unreadable journal or unjournaled held fence hides transaction state, so GC must retain everything. */
import { markovdInstallDirNames } from '../managed-server/activation/markovd-activation-record'
import type { MarkovdActivationTransaction } from '../managed-server/activation/markovd-activation-transaction'
import { readMarkovdActivationTransaction } from '../managed-server/activation/markovd-activation-transaction-store'
import { markovdActivationFenceExists } from '../managed-server/activation/markovd-activation-lock'
import { isUnconfirmedSshCommandTermination } from './remote-exec/remote-exec-command'
import type { MarkovdRemoteExecTarget } from '../managed-server/install/markovd-remote-runtime-control'

type MarkovdGcTransactionPins = { state: 'pinned'; dirNames: string[] } | { state: 'keep-all' }

function transactionVersions(transaction: MarkovdActivationTransaction): (string | null)[] {
  const records = [transaction.recordBefore, transaction.recordAfter]
  const fromRecords = records.flatMap((record) => (record ? [record.active, record.previous] : []))
  if (transaction.operation === 'activate') {
    return [...fromRecords, transaction.candidateVersion]
  }
  return transaction.operation === 'rollback'
    ? [...fromRecords, transaction.incumbentVersion, transaction.targetVersion]
    : fromRecords
}

export async function readMarkovdGcTransactionPins(
  target: MarkovdRemoteExecTarget & { remoteHome: string },
  /** The caller holds the activation fence, so its presence says nothing about another owner. */
  options: { callerHoldsFence?: boolean } = {}
): Promise<MarkovdGcTransactionPins> {
  try {
    const transaction = await readMarkovdActivationTransaction(target)
    if (!transaction) {
      // An unjournaled fence may be a transaction starting or an interrupted release.
      return !options.callerHoldsFence && (await markovdActivationFenceExists(target))
        ? { state: 'keep-all' }
        : { state: 'pinned', dirNames: [] }
    }
    return { state: 'pinned', dirNames: markovdInstallDirNames(transactionVersions(transaction)) }
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return { state: 'keep-all' }
  }
}
