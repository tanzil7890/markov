/** Adopt serving unrecorded markovd under the activation fence only when lock, readiness and installed build identify the same process. Never kill it without census; launching another loses the instance lock. Normal update admission handles version changes. */
import {
  MARKOVD_LOCK_FILE_NAME,
  parseMarkovdInstanceLockRecord,
  type MarkovdLockRecord
} from '../../markovd/markovd-instance-lock'
import { compareMarkovdProcessIdentity } from '../../markovd/markovd-process-start-time'
import type { MarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record'
import {
  readMarkovdActivationRecord,
  writeMarkovdActivationRecord
} from '../../managed-server/activation/markovd-activation-record-store'
import { evaluateMarkovdActivation } from '../../managed-server/activation/markovd-activation-gate'
import { withMarkovdActivationLock } from '../../managed-server/activation/markovd-activation-lock'
import { sameMarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-transaction'
import { readMarkovdActivationTransaction } from '../../managed-server/activation/markovd-activation-transaction-store'
import { readRemoteMarkovdManagedStopTarget } from '../../managed-server/lifecycle/markovd-managed-remote-stop'
import {
  markovdSlotDir,
  resolveMarkovdSlotIdentity,
  type MarkovdSlotOptions
} from '../../ssh/markovd-recovery-slot'
import { MARKOVD_PID_FILENAME } from '../../managed-server/install/markovd-remote-host-support'
import {
  parseMarkovdReadinessWaitOutput,
  readMarkovdReadinessNowCommand
} from '../../managed-server/install/markovd-remote-readiness-wait'
import { readBoundedMarkovdRemoteRecord } from '../../managed-server/install/markovd-remote-record-file'
import { execMarkovdRemote } from '../../managed-server/install/markovd-remote-runtime-control'
import {
  MARKOVD_INSTALL_MODEL,
  remoteInstallDirName,
  remoteInstallVersionDirRegex
} from '../../managed-server/install/remote-install-model'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath } from '../../ssh/ssh-remote-platform'
import {
  readWslGuestIdentity,
  wslGuestMarkovdIncarnation,
  type WslGuestIdentity
} from '../execution/wsl-guest-process-identity'
import type { WslMarkovdInstanceLockRead } from './wsl-markovd-connect-state-snapshot'

const LOCK_RECORD_MAX_BYTES = 64 * 1024
const UNRECORDED_MARKOVD_CODE = 'wsl_markovd_unrecorded_instance_unverifiable'

export type WslMarkovdAdoption =
  | { outcome: 'none' }
  | { outcome: 'adopted'; version: string; pid: number; record: MarkovdActivationRecord }

export class WslMarkovdUnrecordedInstanceError extends Error {
  readonly code = UNRECORDED_MARKOVD_CODE
  constructor(message: string) {
    super(message)
    this.name = 'WslMarkovdUnrecordedInstanceError'
  }
}

type LockHolder = { pid: number; version: string }

async function readLiveLockHolder(
  slot: MarkovdSlotOptions,
  preRead?: WslMarkovdInstanceLockRead
): Promise<LockHolder | null> {
  const lockPath = joinRemotePath(slot.host, slot.userDataDir, MARKOVD_LOCK_FILE_NAME)
  const read =
    preRead ?? (await readBoundedMarkovdRemoteRecord(slot, lockPath, LOCK_RECORD_MAX_BYTES))
  const lock = read.state === 'present' ? parseMarkovdInstanceLockRecord(read.raw) : null
  // Desktop-role or malformed locks identify no markovd to adopt.
  if (!lock || lock.role === 'desktop') {
    return null
  }
  // Adopt only proven-live holders; otherwise let the host's instance lock arbitrate launch.
  // The snapshot's identity counts only if it was read for this same pid.
  const known =
    preRead?.state === 'present' && preRead.holder?.pid === lock.pid ? preRead.holder.guest : null
  return (await lockHolderLiveness(slot, lock, known)) === 'live'
    ? { pid: lock.pid, version: lock.version }
    : null
}

type LockHolderLiveness = 'live' | 'unverifiable' | 'exited'

/** A PID is no identity after a distro restart reuses it: the lock's boot id and start ticks are. */
async function lockHolderLiveness(
  slot: MarkovdSlotOptions,
  lock: MarkovdLockRecord,
  known: WslGuestIdentity | null = null
): Promise<LockHolderLiveness> {
  const guest = known ?? (await readWslGuestIdentity(slot.conn, lock.pid))
  if (!guest) {
    return 'unverifiable'
  }
  const incarnation = wslGuestMarkovdIncarnation(guest)
  // The guest answered, and no process has that PID.
  if (!incarnation) {
    return 'exited'
  }
  // Compare boot IDs case-insensitively because readers normalize them.
  const recorded = lock.bootId ? { ...lock, bootId: lock.bootId.toLowerCase() } : lock
  const verdict = compareMarkovdProcessIdentity(lock.pid, recorded, {
    incarnation: () => incarnation,
    // Ignore wall-clock starts: guest clocks jump after host sleep.
    startedAtMs: () => null,
    platform: 'linux'
  })
  return verdict === 'matches' ? 'live' : verdict === 'differs' ? 'exited' : 'unverifiable'
}

async function readSlotPid(slot: MarkovdSlotOptions, version: string): Promise<number | null> {
  const pidFile = joinRemotePath(slot.host, markovdSlotDir(slot, version), MARKOVD_PID_FILENAME)
  const raw = await execMarkovdRemote(slot, `cat ${quotePosixShell(pidFile)} 2>/dev/null || true`)
  const pid = Number.parseInt(raw.trim(), 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

/** The holder's slot must publish readiness for this pid, from the build installed there. */
async function proveHolderServesItsSlot(
  slot: MarkovdSlotOptions,
  holder: LockHolder
): Promise<void> {
  const label = `A markovd (pid ${holder.pid}, ${holder.version}) is running in this distro but is not the recorded one`
  const dirName = remoteInstallDirName(MARKOVD_INSTALL_MODEL, holder.version)
  if (!remoteInstallVersionDirRegex(MARKOVD_INSTALL_MODEL).test(dirName)) {
    throw new WslMarkovdUnrecordedInstanceError(`${label}, and its version is not a slot name.`)
  }
  const target = await readRemoteMarkovdManagedStopTarget(slot, holder.version)
  if (target.state !== 'ready' || target.context.instance.pid !== holder.pid) {
    throw new WslMarkovdUnrecordedInstanceError(
      `${label}, and it cannot be identified: ${target.state === 'refused' ? target.reason : 'its readiness names another process.'}`
    )
  }
  const identity = await resolveMarkovdSlotIdentity(slot, holder.version)
  const readiness = parseMarkovdReadinessWaitOutput(
    slot.host,
    await execMarkovdRemote(slot, readMarkovdReadinessNowCommand(slot.host, identity.remoteDir))
  )
  const verdict = evaluateMarkovdActivation(
    readiness.state === 'ready' ? readiness.readiness : null,
    {
      buildHash: identity.buildHash,
      fullVersion: identity.version
    }
  )
  if (verdict.decision === 'reject') {
    throw new WslMarkovdUnrecordedInstanceError(`${label}, and ${verdict.reason}`)
  }
}

function adoptedRecord(
  record: MarkovdActivationRecord,
  version: string,
  now: Date
): MarkovdActivationRecord {
  if (record.active === version) {
    return record
  }
  const { activeAppVersion, previousAppVersion: _previousAppVersion, ...rest } = record
  return {
    ...rest,
    active: version,
    previous: record.active ?? record.previous,
    ...(record.active && activeAppVersion ? { previousAppVersion: activeAppVersion } : {}),
    activatedAt: now.toISOString(),
    // Prelaunch snapshot belongs to another activation; rollback must not restore it.
    snapshot: null
  }
}

/** Adopt lock owners missing from record/pid file only with proof; otherwise refuse rather than launch into an occupied instance lock. */
export async function adoptUnrecordedWslMarkovd(
  slot: MarkovdSlotOptions,
  record: MarkovdActivationRecord,
  now: () => Date = () => new Date(),
  /** This connect's snapshot of the lock; the fenced re-check below always reads the host. */
  preReadLock?: WslMarkovdInstanceLockRead
): Promise<WslMarkovdAdoption> {
  const holder = await readLiveLockHolder(slot, preReadLock)
  if (!holder) {
    return { outcome: 'none' }
  }
  if (
    record.active === holder.version &&
    (await readSlotPid(slot, holder.version)) === holder.pid
  ) {
    return { outcome: 'none' }
  }
  await proveHolderServesItsSlot(slot, holder)
  return withMarkovdActivationLock(
    slot,
    async () => {
      const current = await readMarkovdActivationRecord(slot)
      if (!sameMarkovdActivationRecord(current, record)) {
        throw new WslMarkovdUnrecordedInstanceError(
          'The activation record changed while an unrecorded markovd was being adopted. Retry.'
        )
      }
      if (await readMarkovdActivationTransaction(slot)) {
        throw new WslMarkovdUnrecordedInstanceError(
          'An interrupted activation is pending, so an unrecorded markovd cannot be adopted yet.'
        )
      }
      const again = await readLiveLockHolder(slot)
      if (again?.pid !== holder.pid || again.version !== holder.version) {
        throw new WslMarkovdUnrecordedInstanceError(
          'The unrecorded markovd changed while it was being adopted. Retry.'
        )
      }
      const pidFile = joinRemotePath(
        slot.host,
        markovdSlotDir(slot, holder.version),
        MARKOVD_PID_FILENAME
      )
      await execMarkovdRemote(
        slot,
        `(umask 077 && printf '%s\\n' ${String(holder.pid)} > ${quotePosixShell(pidFile)})`
      )
      const next = adoptedRecord(current, holder.version, now())
      if (next !== current) {
        await writeMarkovdActivationRecord(slot, next)
      }
      return {
        outcome: 'adopted' as const,
        version: holder.version,
        pid: holder.pid,
        record: next
      }
    },
    () => {
      throw new WslMarkovdUnrecordedInstanceError(
        'Another Markov is changing this distro’s server, so an unrecorded markovd cannot be adopted now.'
      )
    }
  )
}
