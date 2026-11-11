// Lock before profile load to prevent concurrent writers; terminal daemons own separate endpoints
// and deliberately survive runtime lock release and restart.
import { randomUUID } from 'node:crypto'
import { linkSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  compareMarkovdProcessIdentity,
  readMarkovdProcessIncarnation,
  readMarkovdProcessName,
  readMarkovdProcessStartedAtMs,
  type MarkovdProcessIdentityVerdict,
  type MarkovdProcessIncarnation
} from './markovd-process-start-time'
import {
  assertMarkovdDataRootIsPrivate,
  MarkovdInstanceLockError,
  type MarkovdDataRootPrivacyHooks
} from './markovd-data-root-privacy'
import { hasErrorCode, isProcessAlive } from '../daemon/endpoint/identity/daemon-process-inspection'
import { profileStateAccessMachineIdentity } from '../persistence/profile-state/profile-state-access-identity'
import { markovdDataRootIsOnLocalDisk } from './markovd-data-root-locality'
import type { MarkovdReclaimHintRuntime } from '../../shared/markovd-stale-lock-reclaim'
import { reclaimedUnexpectedExit } from './markovd-unexpected-exit'
import type { MarkovdUnexpectedExit } from '../../shared/markovd-unexpected-exit'
import {
  markovdLockHolderLocality,
  markovdLockHolderUnverifiableError
} from './markovd-lock-holder-locality'
import {
  markovdLockPeer,
  markovdLockSelf,
  markovdPeerIsLiveCloneMachine
} from './markovd-lock-clone-machine'
import {
  MAX_MARKOVD_LOCK_BYTES,
  readBoundedLockFile,
  reclaimAndPublish,
  unlinkQuietly,
  type MarkovdLockRecoveryOwner
} from './markovd-instance-lock-reclaim'
import {
  describeLockHolder,
  parseMarkovdInstanceLockRecord,
  type MarkovdLockRecord
} from './markovd-instance-lock-record'
import { holdMarkovdInstanceLock, type MarkovdInstanceLock } from './markovd-instance-lock-hold'

export {
  parseMarkovdInstanceLockRecord,
  readMarkovdInstanceLockRecord,
  type MarkovdLockRecord
} from './markovd-instance-lock-record'
export type { MarkovdInstanceLock } from './markovd-instance-lock-hold'

export const MARKOVD_LOCK_FILE_NAME = 'markovd.lock'
// Allow old torn writes time to complete before treating garbled records as abandoned.
const GARBLED_LOCK_GRACE_MS = 10_000

export type MarkovdInstanceLockHooks = MarkovdDataRootPrivacyHooks & {
  identity?: () => string
  version?: () => string
  now?: () => Date
  /** EPERM still proves the process exists. */
  processIsAlive?: (pid: number) => boolean
  startedAtMs?: (pid: number) => number | null
  incarnation?: (pid: number) => MarkovdProcessIncarnation | null
  ownerUid?: (pid: number) => number | null
  processName?: (pid: number) => string | null
  /** Only differs can reject a live PID’s identity. */
  holderIdentity?: (record: MarkovdLockRecord) => MarkovdProcessIdentityVerdict
  /** Desktop callers must first hold Electron’s single-instance lock to reclaim desktop records. */
  role?: 'markovd' | 'desktop'
  machineIdentity?: () => string | null
  /** Establishes locality for legacy machine-less records. */
  dataRootIsOnLocalDisk?: (dataRoot: string) => boolean
  /** Explicit stale-reclaim confirmation permits judging otherwise unverifiable PIDs locally. */
  reclaimConfirmed?: (record: MarkovdLockRecord, role: 'holder' | 'recovery-owner') => boolean
  reclaimHintRuntime?: MarkovdReclaimHintRuntime | null
  bootStartedAtMs?: () => number | null
  /** Another process now holds the lock, so this one no longer has the data root to itself. */
  onExclusivityLost?: () => void
}

function defaultIdentity(): string {
  // POSIX names can repeat across containers; filesystem permissions enforce numeric UIDs.
  return process.platform === 'win32'
    ? (userInfo().username ?? 'unknown')
    : String(process.getuid?.() ?? 'unknown')
}

/** Reclaim dead holders only; preserve live or foreign-identity ownership. */
export function acquireMarkovdInstanceLock(
  dataRoot: string,
  hooks: MarkovdInstanceLockHooks = {}
): MarkovdInstanceLock {
  const identity = (hooks.identity ?? defaultIdentity)()
  const isAlive = hooks.processIsAlive ?? isProcessAlive
  const readStartedAt = hooks.startedAtMs ?? readMarkovdProcessStartedAtMs
  const readIncarnation = hooks.incarnation ?? readMarkovdProcessIncarnation
  const holderIdentity =
    hooks.holderIdentity ??
    ((holder: MarkovdLockRecord) =>
      compareMarkovdProcessIdentity(holder.pid, holder, {
        startedAtMs: readStartedAt,
        incarnation: readIncarnation,
        ownerUid: hooks.ownerUid,
        platform: hooks.platform
      }))

  try {
    mkdirSync(dataRoot, { recursive: true, mode: 0o700 })
  } catch (error) {
    throw new MarkovdInstanceLockError(
      'markovd_data_root_unusable',
      `Cannot create the markovd data root ${dataRoot}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  // Desktop profiles retain existing permissions; markovd tightens its own roots.
  if ((hooks.role ?? 'markovd') === 'markovd') {
    assertMarkovdDataRootIsPrivate(dataRoot, hooks)
  }

  const lockPath = join(dataRoot, MARKOVD_LOCK_FILE_NAME)
  const machineIdentity = (hooks.machineIdentity ?? profileStateAccessMachineIdentity)()
  const record: MarkovdLockRecord = {
    pid: process.pid,
    startedAtMs: readStartedAt(process.pid),
    ...readIncarnation(process.pid),
    identity,
    version: (hooks.version ?? (() => process.env.MARKOV_VERSION ?? 'unknown'))(),
    acquiredAt: (hooks.now ?? (() => new Date()))().toISOString(),
    nonce: randomUUID(),
    role: hooks.role ?? 'markovd',
    ...(machineIdentity ? { machineIdentity } : {}),
    host: hostname()
  }
  const serialized = JSON.stringify(record)
  const platform = hooks.platform ?? process.platform
  const self = markovdLockSelf(record, Date.parse(record.acquiredAt), hooks.bootStartedAtMs?.())

  // Stage then hard-link so canonical records are always complete.
  const publish = (): boolean => {
    const staged = `${lockPath}.staged-${process.pid}-${randomUUID()}`
    try {
      writeFileSync(staged, serialized, { flag: 'wx', mode: 0o600 })
      linkSync(staged, lockPath)
      return true
    } catch (error) {
      if (hasErrorCode(error, 'EEXIST')) {
        return false
      }
      throw new MarkovdInstanceLockError(
        'markovd_data_root_unusable',
        `Cannot write the markovd instance lock ${lockPath}: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      unlinkQuietly(staged)
    }
  }

  const lockFor = (
    previousUnexpectedExit: MarkovdUnexpectedExit | null = null
  ): MarkovdInstanceLock =>
    holdMarkovdInstanceLock(lockPath, record, publish, {
      previousUnexpectedExit,
      onExclusivityLost: hooks.onExclusivityLost ?? (() => {})
    })
  if (publish()) {
    return lockFor()
  }

  const dataRootIsLocal = (): boolean =>
    (hooks.dataRootIsOnLocalDisk ?? markovdDataRootIsOnLocalDisk)(dataRoot)
  const judgedHere = (holder: MarkovdLockRecord, role: 'holder' | 'recovery-owner'): boolean => {
    const peer = markovdLockPeer(holder, role === 'holder' ? lockPath : null)
    const locality = markovdLockHolderLocality(peer, self, dataRootIsLocal, platform)
    return (
      locality === 'local' || (locality === 'unknown' && !!hooks.reclaimConfirmed?.(holder, role))
    )
  }
  const recoveryOwner: MarkovdLockRecoveryOwner = {
    record: serialized,
    exited: (ownerRecord) => {
      const owner = parseMarkovdInstanceLockRecord(ownerRecord)
      return Boolean(
        owner &&
        owner.identity === identity &&
        judgedHere(owner, 'recovery-owner') &&
        (!isAlive(owner.pid) || holderIdentity(owner) === 'differs')
      )
    }
  }

  const existingContents = readBoundedLockFile(lockPath)
  if (existingContents === null) {
    // Unreadable records cannot prove their holder exited.
    throw new MarkovdInstanceLockError(
      'markovd_instance_lock_unreadable',
      `The markovd instance lock at ${lockPath} is unreadable or larger than ` +
        `${MAX_MARKOVD_LOCK_BYTES} bytes. Refusing to reclaim it without proof that its holder ` +
        'has exited. Stop markovd and remove the stale lock manually.'
    )
  }
  const existing = parseMarkovdInstanceLockRecord(existingContents)
  if (!existing) {
    // Old torn writes become reclaimable only after the writer grace period.
    if (garbledLockIsAbandoned(lockPath)) {
      reclaimAndPublish(lockPath, dataRoot, existingContents, publish, recoveryOwner)
      return lockFor()
    }
    throw new MarkovdInstanceLockError(
      'markovd_instance_lock_held',
      `The markovd instance lock at ${lockPath} is still being written by another process. Retry.`
    )
  }
  if (existing.identity !== identity) {
    throw new MarkovdInstanceLockError(
      'markovd_instance_lock_foreign_identity',
      `The markovd data root ${dataRoot} is locked by identity ${existing.identity} (pid ` +
        `${existing.pid}); this process runs as ${identity}. Two identities sharing one data ` +
        'root corrupts it. Give each its own MARKOV_USER_DATA.'
    )
  }
  const holder = markovdLockPeer(existing, lockPath)
  if (!judgedHere(existing, 'holder')) {
    // Foreign/unverifiable PIDs prove neither absence nor reuse here.
    throw markovdLockHolderUnverifiableError({
      holder: `${describeLockHolder(existing)} (pid ${existing.pid}, started ${existing.acquiredAt})`,
      foreign: markovdLockHolderLocality(holder, self, dataRootIsLocal, platform) === 'foreign',
      ...(markovdPeerIsLiveCloneMachine(holder, self, dataRootIsLocal, platform)
        ? { cloneMachine: { role: hooks.role ?? 'markovd' } }
        : {}),
      dataRoot,
      lockPath,
      hintRuntime:
        hooks.reclaimHintRuntime !== undefined
          ? hooks.reclaimHintRuntime
          : hooks.role === 'desktop'
            ? null
            : { execPath: process.execPath, entry: process.argv[1] }
    })
  }
  // Electron’s already-held lock proves other desktop instances absent despite PID reuse.
  const staleDesktopRecord = hooks.role === 'desktop' && existing.role === 'desktop'
  const verdict = staleDesktopRecord || !isAlive(existing.pid) ? null : holderIdentity(existing)
  if (verdict === 'unproven' && !existing.bootId) {
    throw possiblyReusedPidError(lockPath, existing, hooks.processName ?? readMarkovdProcessName)
  }
  if (verdict !== null && verdict !== 'differs') {
    throw new MarkovdInstanceLockError(
      'markovd_instance_lock_held',
      `${describeLockHolder(existing)} (pid ${existing.pid}, started ` +
        `${existing.acquiredAt || 'unknown'}) already owns the data root ${dataRoot}. Stop it ` +
        'before starting another, or use a different MARKOV_USER_DATA.'
    )
  }
  reclaimAndPublish(lockPath, dataRoot, existingContents, publish, recoveryOwner)
  return lockFor(reclaimedUnexpectedExit(existing, record, self.bootStartedAtMs))
}

function possiblyReusedPidError(
  lockPath: string,
  existing: MarkovdLockRecord,
  processName: (pid: number) => string | null
): MarkovdInstanceLockError {
  const name = processName(existing.pid)
  const holder = existing.role === 'desktop' ? 'the Markov desktop app' : 'markovd'
  return new MarkovdInstanceLockError(
    'markovd_instance_lock_held',
    `The markovd instance lock at ${lockPath} names pid ${existing.pid}, which is still running ` +
      `(as ${name ? `"${name}"` : 'an unknown program'}). This lock, written by ${holder} at ` +
      `${existing.acquiredAt}, does not record which boot it came from, so Markov cannot tell ` +
      `whether that process is still ${holder} or an unrelated program that reused the PID. ` +
      `If you are sure ${holder} is not running for this data root, delete ${lockPath} and ` +
      'try again, or use a different MARKOV_USER_DATA.'
  )
}

function garbledLockIsAbandoned(lockPath: string): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs > GARBLED_LOCK_GRACE_MS
  } catch {
    return false
  }
}
