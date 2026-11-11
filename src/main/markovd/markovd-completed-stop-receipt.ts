import { lstatSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { z } from 'zod'
import { readNodeFileSyncWithinLimit } from '../../shared/node-bounded-file-reader'
import { writeDurableSecureJsonFile } from '../../shared/secure-file'
import { hasErrorCode } from '../daemon/endpoint/identity/daemon-process-inspection'
import {
  MARKOVD_STOP_RECEIPTS_DIRNAME,
  MarkovdCompletedStopReceiptSchema,
  MarkovdManagedStopRequestSchema,
  MarkovdDaemonRetirementRecordSchema,
  markovdManagedStopRequestKey,
  type MarkovdCompletedStopReceipt,
  type MarkovdDaemonRetirementRecord,
  type MarkovdManagedStopRequest
} from '../../shared/markovd-stop-request'

const RECEIPT_MAX_BYTES = 64 * 1024

type ReceiptKind = 'completed' | 'retirement' | 'decision'

export function markovdStopReceiptPath(
  request: MarkovdManagedStopRequest,
  kind: ReceiptKind
): string {
  const { transactionId, instance } = MarkovdManagedStopRequestSchema.parse(request)
  const suffix = kind === 'completed' ? '' : `.${kind}`
  return join(
    dirname(instance.lockPath),
    MARKOVD_STOP_RECEIPTS_DIRNAME,
    `${transactionId}${suffix}.json`
  )
}

/** Absent returns null; mismatched request receipts throw. */
export function readMarkovdStopReceipt<T extends { request: MarkovdManagedStopRequest }>(
  request: MarkovdManagedStopRequest,
  kind: ReceiptKind,
  schema: z.ZodType<T>
): T | null {
  const path = markovdStopReceiptPath(request, kind)
  try {
    if (!lstatSync(path).isFile()) {
      throw new Error('markovd_stop_receipt_unverifiable')
    }
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  const receipt = schema.parse(
    JSON.parse(readNodeFileSyncWithinLimit(path, RECEIPT_MAX_BYTES).buffer.toString('utf8'))
  )
  if (markovdManagedStopRequestKey(receipt.request) !== markovdManagedStopRequestKey(request)) {
    throw new Error('markovd_stop_receipt_mismatch')
  }
  return receipt
}

function writeReceipt(
  request: MarkovdManagedStopRequest,
  kind: ReceiptKind,
  receipt: unknown
): void {
  if (!writeDurableSecureJsonFile(markovdStopReceiptPath(request, kind), receipt)) {
    throw new Error('markovd_stop_receipt_permissions_unconfirmed')
  }
}

export function readMarkovdCompletedStopReceipt(
  request: MarkovdManagedStopRequest
): MarkovdCompletedStopReceipt | null {
  return readMarkovdStopReceipt(request, 'completed', MarkovdCompletedStopReceiptSchema)
}

/** Persist only after proven exit and fsync even existing receipts.
 * Missing retirement records remain unverifiable. */
export function persistMarkovdCompletedStopReceipt(
  request: MarkovdManagedStopRequest,
  exitedAt: Date
): MarkovdCompletedStopReceipt {
  const parsed = MarkovdManagedStopRequestSchema.parse(request)
  const retirement = parsed.retireIdleDaemon
    ? (readMarkovdDaemonRetirementRecord(parsed)?.retirement ?? 'unverifiable')
    : undefined
  const receipt = readMarkovdCompletedStopReceipt(parsed) ?? {
    schemaVersion: 1 as const,
    kind: 'markovd_managed_stop_completed' as const,
    request: parsed,
    exitedAt: exitedAt.toISOString(),
    ...(retirement ? { retirement } : {})
  }
  writeReceipt(parsed, 'completed', receipt)
  return receipt
}

export function readMarkovdDaemonRetirementRecord(
  request: MarkovdManagedStopRequest
): MarkovdDaemonRetirementRecord | null {
  return readMarkovdStopReceipt(request, 'retirement', MarkovdDaemonRetirementRecordSchema)
}

export function persistMarkovdDaemonRetirementRecord(
  request: MarkovdManagedStopRequest,
  outcome: Pick<MarkovdDaemonRetirementRecord, 'retirement' | 'liveSessions' | 'reason'>
): void {
  writeReceipt(request, 'retirement', {
    schemaVersion: 1,
    kind: 'markovd_managed_stop_retirement',
    request: MarkovdManagedStopRequestSchema.parse(request),
    // Name fields explicitly; extra in-process fields would fail the strict schema.
    retirement: outcome.retirement,
    liveSessions: outcome.liveSessions,
    reason: outcome.reason
  })
}
