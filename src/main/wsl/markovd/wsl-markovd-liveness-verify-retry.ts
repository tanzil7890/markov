import type { Supervised, WslMarkovdTimer } from './wsl-markovd-liveness-state'
import { wslMarkovdVerifyRetryDelayMs } from './wsl-markovd-reconnect-backoff'

export function scheduleSupervisedVerify(
  entry: Supervised,
  schedule: (delayMs: number, task: () => void) => WslMarkovdTimer,
  verify: () => void
): void {
  entry.timer?.cancel()
  const delayMs = wslMarkovdVerifyRetryDelayMs(entry.verifyStreak)
  entry.verifyStreak += 1
  entry.timer = schedule(delayMs, () => {
    entry.timer = null
    verify()
  })
}
