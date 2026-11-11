// Consume clean idle-stop evidence once; discard failed stops so later crashes cannot inherit it.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { readNodeFileSyncWithinLimit } from '../../shared/node-bounded-file-reader'
import { writeDurableSecureJsonFile } from '../../shared/secure-file'
import {
  MARKOVD_IDLE_STOP_RECORD_FILENAME,
  MarkovdIdleStopRecordSchema,
  type MarkovdIdleStopRecord
} from '../../shared/markovd-idle-exit'
import type { MarkovdIdleExitEvidence } from './markovd-idle-exit-monitor'
import { hasErrorCode } from '../daemon/endpoint/identity/daemon-process-inspection'

const RECORD_MAX_BYTES = 16 * 1024

export function markovdIdleStopRecordPath(userDataPath: string): string {
  return join(userDataPath, MARKOVD_IDLE_STOP_RECORD_FILENAME)
}

export function writeMarkovdIdleStopRecord(
  userDataPath: string,
  evidence: MarkovdIdleExitEvidence,
  version: string
): void {
  const record: MarkovdIdleStopRecord = {
    schemaVersion: 1,
    kind: 'markovd_idle_stop',
    pid: process.pid,
    version,
    quietSince: new Date(evidence.quietSince).toISOString(),
    stoppedAt: new Date(evidence.stoppedAt).toISOString(),
    idleTimeoutMs: evidence.timeoutMs
  }
  if (!writeDurableSecureJsonFile(markovdIdleStopRecordPath(userDataPath), record)) {
    throw new Error('markovd_idle_stop_record_permissions_unconfirmed')
  }
}

export function consumeMarkovdIdleStopRecord(userDataPath: string): MarkovdIdleStopRecord | null {
  const path = markovdIdleStopRecordPath(userDataPath)
  let record: MarkovdIdleStopRecord | null = null
  try {
    const raw = readNodeFileSyncWithinLimit(path, RECORD_MAX_BYTES).buffer.toString('utf8')
    record = MarkovdIdleStopRecordSchema.parse(JSON.parse(raw))
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null
    }
    console.error('[markovd] ignoring an unreadable idle-stop record:', error)
  }
  rmSync(path, { force: true })
  return record
}

export function discardMarkovdIdleStopRecord(userDataPath: string): void {
  rmSync(markovdIdleStopRecordPath(userDataPath), { force: true })
}
