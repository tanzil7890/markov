/** Stop files reach only the watching markovd; signals from stale PID records could stop an unrelated reused process. */
import { z } from 'zod'
import { openEnum } from './zod-salvage'

/** Plain request in the slot directory: the same graceful stop as SIGTERM. */
export const MARKOVD_STOP_REQUEST_FILENAME = '.markovd-stop-request'
/** Prefix of an instance-bound request in the data root; older listeners never match it. */
export const MARKOVD_MANAGED_STOP_REQUEST_PREFIX = '.markovd-managed-stop-request'
export const MARKOVD_MANAGED_STOP_REQUEST_MAX_BYTES = 32 * 1024
export const MARKOVD_STOP_RECEIPTS_DIRNAME = 'markovd-stop-receipts'
export const MARKOVD_COMPLETE_MANAGED_STOP_FLAG = '--complete-managed-stop'
/** Names a staged request file instead of inline JSON; Windows hosts never put the JSON on argv. */
export const MARKOVD_MANAGED_STOP_REQUEST_FILE_FLAG = '--request-file'

/** One markovd process: its PID, start time, and the instance lock record it published. */
export const MarkovdManagedStopInstanceSchema = z.object({
  pid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  startedAtMs: z.number().finite().nonnegative().nullable(),
  /** Linux only, copied from the lock; older clients omit it and older slots drop it. */
  linuxStartTicks: z.string().regex(/^\d+$/).max(32).optional().catch(undefined),
  bootId: z.string().min(1).max(255).optional().catch(undefined),
  nonce: z.string().min(1).max(255),
  lockPath: z.string().min(1).max(4096)
})

// Older slots drop newer optional request fields rather than refuse the stop.
export const MarkovdManagedStopRequestSchema = z.object({
  schemaVersion: z.literal(1),
  transactionId: z.uuid(),
  version: z.string().min(1).max(255),
  runtimeId: z.string().min(1).max(255),
  instance: MarkovdManagedStopInstanceSchema,
  /** Best effort: also retire the terminal daemon if it is provably idle. Never blocks the stop. */
  retireIdleDaemon: z.literal(true).optional()
})

export type MarkovdManagedStopInstance = z.infer<typeof MarkovdManagedStopInstanceSchema>
export type MarkovdManagedStopRequest = z.infer<typeof MarkovdManagedStopRequestSchema>

/** Equality key for a request; omits the incarnation, which an older client recovering it drops. */
export function markovdManagedStopRequestKey(request: MarkovdManagedStopRequest): string {
  const { instance, ...rest } = MarkovdManagedStopRequestSchema.parse(request)
  const { linuxStartTicks: _ticks, bootId: _bootId, ...bound } = instance
  return JSON.stringify({ ...rest, instance: bound })
}
/** What a stopping markovd must match before a managed request may stop it. */
export type MarkovdManagedStopContext = Omit<
  MarkovdManagedStopRequest,
  'schemaVersion' | 'transactionId'
>

const STOP_VERDICTS = ['live', 'unverifiable', 'exited'] as const
const RETIREMENT_VERDICTS = ['retired', 'live', 'unverifiable'] as const

/** The execution host's verdict; `exited` only on proof, never on silence. */
export const MarkovdManagedStopVerdictSchema = z.enum(STOP_VERDICTS)

/** `retired` only when the daemon accepted; a busy daemon stays up and keeps its terminals. */
export const MarkovdDaemonRetirementVerdictSchema = z.enum(RETIREMENT_VERDICTS)

// Read by clients older than the slot that printed them: unknown fields and arms degrade.
const stopReplyRequestFields = MarkovdManagedStopRequestSchema.shape

export const MarkovdManagedStopCompletionSchema = z.object({
  ...stopReplyRequestFields,
  kind: z.literal('markovd_managed_stop_completion'),
  verdict: openEnum(STOP_VERDICTS, 'unverifiable'),
  receiptPersisted: z.boolean(),
  /** For a request that asked to retire the daemon, the outcome its receipt recorded. */
  retirement: openEnum(RETIREMENT_VERDICTS, 'unverifiable').optional()
})

/** What the stopping markovd observed about its daemon, written before it exits. */
export const MarkovdDaemonRetirementRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('markovd_managed_stop_retirement'),
  request: MarkovdManagedStopRequestSchema,
  retirement: MarkovdDaemonRetirementVerdictSchema,
  liveSessions: z.number().int().nonnegative().nullable(),
  reason: z.string().max(4096).nullable()
})

export const MarkovdCompletedStopReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('markovd_managed_stop_completed'),
  request: MarkovdManagedStopRequestSchema,
  exitedAt: z.iso.datetime({ offset: true }),
  /** Present only when the request asked to retire the daemon. */
  retirement: MarkovdDaemonRetirementVerdictSchema.optional()
})

export type MarkovdManagedStopVerdict = z.infer<typeof MarkovdManagedStopVerdictSchema>
export type MarkovdManagedStopCompletion = z.infer<typeof MarkovdManagedStopCompletionSchema>
export type MarkovdCompletedStopReceipt = z.infer<typeof MarkovdCompletedStopReceiptSchema>
export type MarkovdDaemonRetirementVerdict = z.infer<typeof MarkovdDaemonRetirementVerdictSchema>
export type MarkovdDaemonRetirementRecord = z.infer<typeof MarkovdDaemonRetirementRecordSchema>

export const MARKOVD_CANCEL_MANAGED_STOP_FLAG = '--cancel-managed-stop'
/** Readiness `health.stopRequests`: this build consumes stop files and both commands above. */
export const MARKOVD_STOP_REQUESTS_CAPABILITY = 1

/** Exclusive per-transaction creation ensures only markovd dispatch or client cancellation can win. */
export const MarkovdManagedStopDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('markovd_managed_stop_decision'),
  request: MarkovdManagedStopRequestSchema,
  decision: z.enum(['dispatched', 'canceled'])
})

/** `dispatched` means markovd already acted on the request; the caller must await its exit. */
export const MarkovdManagedStopCancellationSchema = z.object({
  ...stopReplyRequestFields,
  kind: z.literal('markovd_managed_stop_cancellation'),
  // Unknown degrades to `dispatched`: the caller then awaits exit rather than assume a cancel.
  outcome: openEnum(['canceled', 'dispatched'], 'dispatched')
})

export type MarkovdManagedStopDecision = z.infer<typeof MarkovdManagedStopDecisionSchema>
export type MarkovdManagedStopCancellation = z.infer<typeof MarkovdManagedStopCancellationSchema>
