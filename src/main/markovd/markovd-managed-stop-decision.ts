// Exclusive hard links arbitrate stop versus cancel; cancel cannot succeed once dispatch wins.
import { linkSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { writeDurableSecureJsonFile } from '../../shared/secure-file'
import {
  MarkovdManagedStopDecisionSchema,
  MarkovdManagedStopRequestSchema,
  type MarkovdManagedStopDecision,
  type MarkovdManagedStopRequest
} from '../../shared/markovd-stop-request'
import { markovdStopReceiptPath, readMarkovdStopReceipt } from './markovd-completed-stop-receipt'
import { hasErrorCode } from '../daemon/endpoint/identity/daemon-process-inspection'

type MarkovdManagedStopDecisionValue = MarkovdManagedStopDecision['decision']

export function readMarkovdManagedStopDecision(
  request: MarkovdManagedStopRequest
): MarkovdManagedStopDecisionValue | null {
  return (
    readMarkovdStopReceipt(request, 'decision', MarkovdManagedStopDecisionSchema)?.decision ?? null
  )
}

export function claimMarkovdManagedStopDecision(
  input: MarkovdManagedStopRequest,
  decision: MarkovdManagedStopDecisionValue
): MarkovdManagedStopDecisionValue {
  const request = MarkovdManagedStopRequestSchema.parse(input)
  const path = markovdStopReceiptPath(request, 'decision')
  const staged = `${path}.${process.pid}.${randomUUID()}.staged`
  const record: MarkovdManagedStopDecision = {
    schemaVersion: 1,
    kind: 'markovd_managed_stop_decision',
    request,
    decision
  }
  if (!writeDurableSecureJsonFile(staged, record)) {
    rmSync(staged, { force: true })
    throw new Error('markovd_managed_stop_decision_permissions_unconfirmed')
  }
  try {
    linkSync(staged, path)
    return decision
  } catch (error) {
    if (!hasErrorCode(error, 'EEXIST')) {
      throw error
    }
    const standing = readMarkovdManagedStopDecision(request)
    if (!standing) {
      throw new Error('markovd_managed_stop_decision_unverifiable')
    }
    return standing
  } finally {
    rmSync(staged, { force: true })
  }
}
