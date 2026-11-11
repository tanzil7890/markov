import { z } from 'zod'
import { readBoundedLockFile } from './markovd-instance-lock-reclaim'

const MarkovdLockRecordSchema = z.object({
  pid: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  /** Null means PID alone supplies the weaker fence. */
  startedAtMs: z.number().finite().nonnegative().nullable(),
  /** Drift-free Linux identity; tolerate unknown future encodings without losing the whole record. */
  linuxStartTicks: z.string().regex(/^\d+$/).max(32).optional().catch(undefined),
  bootId: z.string().min(1).max(255).optional().catch(undefined),
  identity: z.string().min(1).max(1_024),
  version: z.string().min(1).max(255),
  acquiredAt: z.iso.datetime({ offset: true }),
  nonce: z.string().min(1).max(255),
  /** Older pre-desktop-sharing records omit role. */
  role: z.enum(['markovd', 'desktop']).optional(),
  /** Shared homes require machine identity: foreign PIDs establish no local liveness. */
  machineIdentity: z.string().min(1).max(255).optional().catch(undefined),
  /** Optional legacy-compatible hostname for stale-lock reclaim hints. */
  host: z.string().min(1).max(255).optional().catch(undefined)
})

export type MarkovdLockRecord = z.infer<typeof MarkovdLockRecordSchema>

/** Unreadable/malformed/oversized/absent returns null; this does not prove the lock is free. */
export function readMarkovdInstanceLockRecord(path: string): MarkovdLockRecord | null {
  return parseMarkovdInstanceLockRecord(readBoundedLockFile(path) ?? '')
}

export function parseMarkovdInstanceLockRecord(content: string): MarkovdLockRecord | null {
  try {
    const result = MarkovdLockRecordSchema.safeParse(JSON.parse(content))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function describeLockHolder(record: MarkovdLockRecord): string {
  return record.role === 'desktop' ? 'The Markov desktop app' : 'Another markovd'
}
