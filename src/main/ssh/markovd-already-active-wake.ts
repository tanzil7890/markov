import {
  MarkovdCrashLoopError,
  wakeManagedMarkovdUnlessCrashLooping
} from '../managed-server/lifecycle/markovd-managed-crash-loop'
import { wakeStoppedManagedMarkovd } from '../managed-server/lifecycle/markovd-managed-wake'
import type { MarkovdSlotOptions } from './markovd-recovery-slot'

/** Already-active deploys launch nothing; wake that slot only on proven exit, including after reboot. Return whether it was started. */
export async function wakeAlreadyActiveMarkovd(
  options: MarkovdSlotOptions,
  /** SSH-managed hosts share the crash-loop brake with every other automatic wake. */
  managed?: { environmentId: string; hostLabel: string }
): Promise<boolean> {
  const wake = managed
    ? await wakeManagedMarkovdUnlessCrashLooping(managed.environmentId, managed.hostLabel, options)
    : await wakeStoppedManagedMarkovd(options)
  if (wake.outcome === 'crash-loop') {
    throw new MarkovdCrashLoopError(wake.detail)
  }
  if (wake.outcome === 'recovery-refused') {
    throw new Error(wake.reason)
  }
  return wake.outcome === 'started'
}
