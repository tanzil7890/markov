import { uptime } from 'node:os'
import type { MarkovdUnexpectedExit } from '../../shared/markovd-unexpected-exit'
import type { MarkovdLockRecord } from './markovd-instance-lock'

/** A reclaimed markovd lock from this boot means that run died; without boot evidence a reboot cannot be ruled out. */
export function reclaimedUnexpectedExit(
  holder: MarkovdLockRecord,
  self: Pick<MarkovdLockRecord, 'bootId'>,
  // Linux reads the kernel boot time; elsewhere the OS uptime gives it.
  bootStartedAtMs: number = Date.now() - uptime() * 1000
): MarkovdUnexpectedExit | null {
  const sameBoot =
    holder.bootId && self.bootId
      ? holder.bootId === self.bootId
      : Date.parse(holder.acquiredAt) >= bootStartedAtMs
  return holder.role !== 'desktop' && sameBoot
    ? { pid: holder.pid, version: holder.version, acquiredAt: holder.acquiredAt }
    : null
}

let previousUnexpectedExit: MarkovdUnexpectedExit | null = null
let runFailed = false

/** A fatal stop keeps the instance lock, so the next start reports this run as unexpected. */
export function markMarkovdRunFailed(): void {
  runFailed = true
}

export function markovdRunFailed(): boolean {
  return runFailed
}

/** Set once from the startup lock acquisition, before readiness publishes health. */
export function recordMarkovdPreviousUnexpectedExit(exit: MarkovdUnexpectedExit | null): void {
  previousUnexpectedExit = exit
}

export function markovdPreviousUnexpectedExit(): MarkovdUnexpectedExit | null {
  return previousUnexpectedExit
}
