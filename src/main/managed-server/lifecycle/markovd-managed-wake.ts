// Markovd exit does not prove terminal exit: the terminal daemon can outlive the server.
import { MARKOVD_FENCE_OWNER_FILENAME } from '../activation/markovd-activation-fence-scope'
import type { ServeReadiness } from '../../server/serve-readiness'
import { readMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import { randomUUID } from 'node:crypto'
import {
  markovdActivationFenceExists,
  releaseMarkovdActivationFence,
  withMarkovdActivationLock
} from '../activation/markovd-activation-lock'
import { markovdLivenessProvenExited } from '../install/markovd-remote-launch'
import { readBoundedMarkovdRemoteRecord } from '../install/markovd-remote-record-file'
import { markovdActivationFenceLockDir } from '../activation/markovd-activation-transaction'
import { joinRemotePath } from '../../ssh/ssh-remote-platform'

import { readMarkovdActivationTransaction } from '../activation/markovd-activation-transaction-store'
import {
  MARKOVD_RECOVERY_UNVERIFIABLE_CODE,
  recoverInterruptedMarkovdActivation
} from '../activation/markovd-activation-recovery'
import {
  ensureMarkovdSlotServing,
  markovdSlotDir,
  resolveMarkovdSlotIdentity,
  slotLiveness,
  type MarkovdSlotOptions
} from '../../ssh/markovd-recovery-slot'

type MarkovdManagedWake =
  | { outcome: 'serving' | 'not-activated' | 'unverifiable' }
  /** A recovery launch that failed is still a failed run. */
  | { outcome: 'fenced'; launchFailure?: Error }
  | { outcome: 'started'; readiness: ServeReadiness }
  | { outcome: 'recovery-refused'; reason: string; launchFailure?: Error }

/** Proven stopped, but the caller's gate refused a new launch; only gated wakes can see it. */
type MarkovdManagedGatedWake = MarkovdManagedWake | { outcome: 'launch-refused' }

/** Start only proven-stopped active slots; leave live or unverifiable processes alone. */
export function wakeStoppedManagedMarkovd(
  options: MarkovdSlotOptions,
  onStarting?: () => void
): Promise<MarkovdManagedWake>
/** `mayLaunch` is checked under the fence, at the launch decision itself. */
export function wakeStoppedManagedMarkovd(
  options: MarkovdSlotOptions,
  onStarting: (() => void) | undefined,
  mayLaunch: () => boolean
): Promise<MarkovdManagedGatedWake>
export function wakeStoppedManagedMarkovd(
  options: MarkovdSlotOptions,
  onStarting: () => void = () => {},
  mayLaunch: () => boolean = () => true
): Promise<MarkovdManagedGatedWake> {
  return serializedWake(options, (host) => wakeAfterPrior(options, host, onStarting, mayLaunch))
}

/**
 * WSL's same-version connect: one fence both confirms `expectActive` is still the active slot
 * and starts it if proven stopped. 'replan' means another version is active now; 'fenced' that
 * the fence was busy. Either way the caller takes the full deploy and wake.
 */
export function wakeExpectedMarkovdUnderOneFence(
  options: MarkovdSlotOptions,
  expectActive: string
): Promise<MarkovdManagedWake | { outcome: 'replan' }> {
  return serializedWake(options, async (host) => {
    // An earlier wake's dropped fence is reclaimed only by the full wake, which knows its token.
    if (interruptedWakes.has(host)) {
      return { outcome: 'fenced' }
    }
    // Record ownership before acquisition, as the wake does: a dropped reply leaves a fence only it can reclaim.
    const token = randomUUID()
    interruptedWakes.set(host, token)
    const result = await withMarkovdActivationLock(
      options,
      async (): Promise<MarkovdManagedWake | { outcome: 'replan' }> => {
        if ((await readMarkovdActivationRecord(options)).active !== expectActive) {
          return { outcome: 'replan' }
        }
        const liveness = await slotLiveness(options, markovdSlotDir(options, expectActive))
        if (!markovdLivenessProvenExited(liveness)) {
          return { outcome: liveness === 'LIVE' ? 'serving' : 'unverifiable' }
        }
        const identity = await resolveMarkovdSlotIdentity(options, expectActive)
        return { outcome: 'started', readiness: await ensureMarkovdSlotServing(options, identity) }
      },
      (): MarkovdManagedWake => ({ outcome: 'fenced' }),
      token
    )
    if (interruptedWakes.get(host) === token) {
      interruptedWakes.delete(host)
    }
    return result
  })
}

function serializedWake<T>(
  options: MarkovdSlotOptions,
  run: (host: string) => Promise<T>
): Promise<T> {
  const host = wakeHostKey(options)
  // Serialize per host before remote work so reconnect cannot race an earlier wake's unexplained fence.
  const prior = runningWakes.get(host)
  const wake = (async (): Promise<T> => {
    await prior?.catch(() => {})
    return run(host)
  })()
  runningWakes.set(host, wake)
  void wake
    .catch(() => {})
    .finally(() => {
      if (runningWakes.get(host) === wake) {
        runningWakes.delete(host)
      }
    })
  return wake
}

async function wakeAfterPrior(
  options: MarkovdSlotOptions,
  host: string,
  onStarting: () => void,
  mayLaunch: () => boolean
): Promise<MarkovdManagedGatedWake> {
  const before = await readMarkovdActivationRecord(options)
  if (!before.active) {
    return { outcome: 'not-activated' }
  }
  const liveness = await slotLiveness(options, markovdSlotDir(options, before.active))
  if (!markovdLivenessProvenExited(liveness)) {
    await forgetSettledInterruptedWake(options, host, liveness === 'LIVE')
    return { outcome: liveness === 'LIVE' ? 'serving' : 'unverifiable' }
  }
  if (!(await markovdActivationFenceExists(options))) {
    interruptedWakes.delete(host)
  } else if (!(await releaseOwnInterruptedWakeFence(options, host))) {
    // Recovery can relaunch the slot, so a refused launch skips it too.
    if (!mayLaunch()) {
      return { outcome: 'launch-refused' }
    }
    const recovered = await recoverAbandonedFence(options, onStarting)
    if (recovered) {
      return recovered
    }
  }
  // Record ownership before acquisition: dropped replies can leave fences only this token can reclaim.
  const token = randomUUID()
  interruptedWakes.set(host, token)
  const result = await withMarkovdActivationLock(
    options,
    async (): Promise<MarkovdManagedGatedWake> => {
      // Other clients may change the active slot; reread under the fence.
      const active = (await readMarkovdActivationRecord(options)).active
      if (!active) {
        return { outcome: 'not-activated' }
      }
      if (!mayLaunch()) {
        return { outcome: 'launch-refused' }
      }
      const identity = await resolveMarkovdSlotIdentity(options, active)
      onStarting()
      return { outcome: 'started', readiness: await ensureMarkovdSlotServing(options, identity) }
    },
    (): MarkovdManagedWake => ({ outcome: 'fenced' }),
    token
  )
  if (interruptedWakes.get(host) === token) {
    interruptedWakes.delete(host)
  }
  return result
}

/** Recover abandoned journals under stale, previous-boot or proven-exited fences; busy runs retain ownership. */
async function recoverAbandonedFence(
  options: MarkovdSlotOptions,
  onStarting: () => void
): Promise<MarkovdManagedWake | null> {
  const recovery = await recoverInterruptedMarkovdActivation(options)
  switch (recovery.outcome) {
    case 'none':
      return null
    case 'pending':
      return { outcome: 'fenced' }
    case 'refused': {
      // A failed launch inside recovery is still a failed run.
      const failure = recovery.launchFailure ? { launchFailure: recovery.launchFailure } : {}
      // Retry unverifiable recovery at the next fence check, as with a busy owner.
      return recovery.code === MARKOVD_RECOVERY_UNVERIFIABLE_CODE
        ? { outcome: 'fenced', ...failure }
        : { outcome: 'recovery-refused', reason: recovery.reason, ...failure }
    }
    case 'recovered':
      if (!recovery.readiness) {
        return { outcome: 'not-activated' }
      }
      onStarting()
      return { outcome: 'started', readiness: recovery.readiness }
  }
}

const runningWakes = new Map<string, Promise<unknown>>()

const interruptedWakes = new Map<string, string>()

function wakeOwnerPath(options: MarkovdSlotOptions): string {
  return joinRemotePath(
    options.host,
    markovdActivationFenceLockDir(options.host, options.remoteHome),
    MARKOVD_FENCE_OWNER_FILENAME
  )
}

function wakeHostKey(options: MarkovdSlotOptions): string {
  return `${options.conn.getTarget().id}\0${options.remoteHome}`
}

/**
 * A serving slot skips the fence branch that clears an interrupted wake's token, which would
 * keep the one-fence wake off until restart. Forget it once its fence is gone or another owner's;
 * an unanswered probe proves neither, so the token stays. A fence still ours whose dropped launch
 * did start the slot (proven LIVE, no journal) is released, or deploys would wait for it to age out.
 */
async function forgetSettledInterruptedWake(
  options: MarkovdSlotOptions,
  host: string,
  slotLive: boolean
): Promise<void> {
  const token = interruptedWakes.get(host)
  if (!token) {
    return
  }
  try {
    const owner = (await markovdActivationFenceExists(options))
      ? await readBoundedMarkovdRemoteRecord(options, wakeOwnerPath(options), 64)
      : null
    const ours = owner?.state === 'present' && owner.raw.trim() === token
    if (ours && slotLive && !(await readMarkovdActivationTransaction(options))) {
      // The release command re-proves the owner token on the host before removing anything.
      await releaseMarkovdActivationFence(options, token)
    } else if (ours || owner?.state === 'absent') {
      return
    }
    if (interruptedWakes.get(host) === token) {
      interruptedWakes.delete(host)
    }
  } catch {
    // Unverifiable: keep the token for the next wake.
  }
}

/** Reclaim only this client's journal-free interrupted fence after proving slot exit. */
async function releaseOwnInterruptedWakeFence(
  options: MarkovdSlotOptions,
  host: string
): Promise<boolean> {
  const token = interruptedWakes.get(host)
  if (!token || (await readMarkovdActivationTransaction(options))) {
    return false
  }
  // A new owner may not have written its token yet; absence cannot prove this fence ours.
  const owner = await readBoundedMarkovdRemoteRecord(options, wakeOwnerPath(options), 64)
  if (owner.state !== 'present' || owner.raw.trim() !== token) {
    interruptedWakes.delete(host)
    return false
  }
  await releaseMarkovdActivationFence(options, token)
  interruptedWakes.delete(host)
  return true
}
