import { rmSync } from 'node:fs'
import type {
  MarkovdManagedStopCancellation,
  MarkovdManagedStopRequest
} from '../../shared/markovd-stop-request'
import { claimMarkovdManagedStopDecision } from './markovd-managed-stop-decision'
import {
  markovdManagedStopRequestPath,
  readMarkovdManagedStopRequest
} from './markovd-managed-stop-request'

/** Dispatched stops cannot be canceled; their completion verdict remains authoritative. */
export function cancelMarkovdManagedStop(
  request: MarkovdManagedStopRequest
): MarkovdManagedStopCancellation['outcome'] {
  const outcome = claimMarkovdManagedStopDecision(request, 'canceled')
  if (outcome === 'canceled') {
    withdrawMarkovdManagedStopRequest(request)
  }
  return outcome
}

export function withdrawMarkovdManagedStopRequest(request: MarkovdManagedStopRequest): void {
  const path = markovdManagedStopRequestPath(request.instance)
  try {
    if (readMarkovdManagedStopRequest(path).transactionId === request.transactionId) {
      rmSync(path, { force: true })
    }
  } catch {
    // The persisted decision fences this transaction even if its request is gone.
  }
}
