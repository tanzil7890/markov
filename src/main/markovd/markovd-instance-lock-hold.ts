// Holding the lock means re-proving it on every heartbeat, not only at acquisition.
import { statSync, unlinkSync, utimesSync } from 'node:fs'
import { startMarkovdLockHeartbeat } from './markovd-lock-clone-machine'
import { readBoundedLockFile } from './markovd-instance-lock-reclaim'
import {
  describeLockHolder,
  parseMarkovdInstanceLockRecord,
  type MarkovdLockRecord
} from './markovd-instance-lock-record'
import type { MarkovdUnexpectedExit } from '../../shared/markovd-unexpected-exit'

export type MarkovdInstanceLock = {
  readonly path: string
  readonly record: MarkovdLockRecord
  readonly previousUnexpectedExit: MarkovdUnexpectedExit | null
  release(): void
}

type MarkovdLockBeat = 'held' | 'lost' | 'unproven'

function lockIsAbsent(lockPath: string): boolean {
  try {
    return !statSync(lockPath, { throwIfNoEntry: false })
  } catch {
    // Unstattable (e.g. a Windows delete-pending file) proves nothing; the next beat retries.
    return false
  }
}

/** Re-assert ownership: a removed lock lets the next starter in, so re-publish it or yield to its new holder. */
function beatMarkovdInstanceLock(
  lockPath: string,
  record: MarkovdLockRecord,
  publish: () => boolean
): MarkovdLockBeat {
  let current = readBoundedLockFile(lockPath)
  if (current === null && lockIsAbsent(lockPath)) {
    try {
      if (publish()) {
        console.warn(
          `[markovd] The instance lock ${lockPath} was removed while markovd ran; restored it.`
        )
        return 'held'
      }
    } catch (error) {
      console.warn('[markovd] could not restore the removed instance lock:', error)
      return 'unproven'
    }
    // Another starter published between the read and the restore.
    current = readBoundedLockFile(lockPath)
  }
  const holder = parseMarkovdInstanceLockRecord(current ?? '')
  if (!holder) {
    // Starters refuse unreadable records, and torn ones show up as a new holder by the next beat.
    console.warn(`[markovd] could not read the instance lock ${lockPath} to confirm ownership`)
    return 'unproven'
  }
  if (holder.nonce !== record.nonce) {
    console.error(
      `[markovd] ${describeLockHolder(holder)} (pid ${holder.pid}) took over the instance lock ` +
        `${lockPath}.`
    )
    return 'lost'
  }
  try {
    const now = new Date()
    utimesSync(lockPath, now, now)
  } catch (error) {
    // A stalled heartbeat lets a machine sharing this machine-id take the lock.
    console.warn('[markovd] could not refresh the instance lock heartbeat:', error)
  }
  return 'held'
}

export function holdMarkovdInstanceLock(
  lockPath: string,
  record: MarkovdLockRecord,
  publish: () => boolean,
  {
    previousUnexpectedExit,
    onExclusivityLost
  }: { previousUnexpectedExit: MarkovdUnexpectedExit | null; onExclusivityLost: () => void }
): MarkovdInstanceLock {
  let released = false
  const stopHeartbeat = startMarkovdLockHeartbeat(() => {
    if (beatMarkovdInstanceLock(lockPath, record, publish) === 'lost') {
      stopHeartbeat()
      onExclusivityLost()
    }
  })
  return {
    path: lockPath,
    record,
    previousUnexpectedExit,
    release: () => {
      if (released) {
        return
      }
      released = true
      stopHeartbeat()
      // Re-read ownership before unlinking so a successor’s live runtime cannot be unlocked.
      const current = parseMarkovdInstanceLockRecord(readBoundedLockFile(lockPath) ?? '')
      if (!current || current.nonce !== record.nonce) {
        return
      }
      try {
        unlinkSync(lockPath)
      } catch {
        // Dead-PID leftovers can be reclaimed on the next start.
      }
    }
  }
}
