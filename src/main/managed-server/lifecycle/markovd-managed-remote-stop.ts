// Readiness and instance-lock records must agree before the slot's own build requests a stop.
import { randomUUID } from 'node:crypto'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { selectMarkovdSlotRuntimeCommand } from '../install/markovd-remote-runtime'
import {
  parseMarkovdReadinessWaitOutput,
  readMarkovdReadinessNowCommand
} from '../install/markovd-remote-readiness-wait'
import { execMarkovdRemote } from '../install/markovd-remote-runtime-control'
import { readBoundedMarkovdRemoteRecord } from '../install/markovd-remote-record-file'
import { markovdSlotDir, type MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import { isWindowsRemoteHost, joinRemotePath } from '../../ssh/ssh-remote-platform'
import { isUnconfirmedSshCommandTermination } from '../../ssh/remote-exec/remote-exec-command'
import {
  markovdWindowsNodeCommandLine,
  markovdWindowsSlotOpCommand,
  readMarkovdWindowsEncodedAnswer
} from '../install/markovd-remote-windows-node'
import { MARKOVD_WINDOWS_RUNTIME_MARKER } from '../host-state/markovd-windows-host-script'
import {
  MARKOVD_LOCK_FILE_NAME,
  parseMarkovdInstanceLockRecord
} from '../../markovd/markovd-instance-lock'
import {
  MARKOVD_CANCEL_MANAGED_STOP_FLAG,
  MARKOVD_COMPLETE_MANAGED_STOP_FLAG,
  MARKOVD_MANAGED_STOP_REQUEST_FILE_FLAG,
  MARKOVD_STOP_REQUESTS_CAPABILITY,
  MarkovdManagedStopCancellationSchema,
  MarkovdManagedStopCompletionSchema,
  type MarkovdManagedStopCancellation,
  type MarkovdManagedStopCompletion,
  type MarkovdManagedStopContext,
  type MarkovdManagedStopRequest
} from '../../../shared/markovd-stop-request'

const LOCK_RECORD_MAX_BYTES = 64 * 1024

export type MarkovdManagedStopTarget =
  | { state: 'ready'; context: MarkovdManagedStopContext }
  | { state: 'refused'; verdict: 'unverifiable'; code: string; reason: string }

function refused(code: string, reason: string): MarkovdManagedStopTarget {
  return { state: 'refused', verdict: 'unverifiable', code, reason }
}

export async function readRemoteMarkovdManagedStopTarget(
  options: MarkovdSlotOptions,
  version: string
): Promise<MarkovdManagedStopTarget> {
  const slotDir = markovdSlotDir(options, version)
  const readiness = parseMarkovdReadinessWaitOutput(
    options.host,
    await execMarkovdRemote(options, readMarkovdReadinessNowCommand(options.host, slotDir))
  )
  if (readiness.state !== 'ready' || !readiness.readiness.health) {
    return refused(
      'markovd_managed_stop_readiness_unverifiable',
      `markovd ${version} has no readable readiness record, so the running instance is unknown.`
    )
  }
  const { health, runtimeId } = readiness.readiness
  if (health.stopRequests !== MARKOVD_STOP_REQUESTS_CAPABILITY) {
    return refused(
      'markovd_managed_stop_unsupported',
      `markovd ${version} predates managed stop requests; it can only be stopped by signal.`
    )
  }
  const lockPath = joinRemotePath(options.host, options.userDataDir, MARKOVD_LOCK_FILE_NAME)
  const lockRead = await readBoundedMarkovdRemoteRecord(options, lockPath, LOCK_RECORD_MAX_BYTES)
  const lock = lockRead.state === 'present' ? parseMarkovdInstanceLockRecord(lockRead.raw) : null
  if (!lock || lock.pid !== health.pid || !runtimeId) {
    return refused(
      'markovd_managed_stop_instance_unverifiable',
      `The instance lock does not name the markovd ${version} that published readiness.`
    )
  }
  return {
    state: 'ready',
    context: {
      version,
      runtimeId,
      instance: {
        pid: lock.pid,
        startedAtMs: lock.startedAtMs,
        // Newer slots use boot/start ticks to avoid wall-clock drift; older readers drop them.
        ...(lock.linuxStartTicks && lock.bootId
          ? { linuxStartTicks: lock.linuxStartTicks, bootId: lock.bootId }
          : {}),
        nonce: lock.nonce,
        lockPath
      }
    }
  }
}

export async function completeRemoteMarkovdManagedStop(
  options: MarkovdSlotOptions,
  request: MarkovdManagedStopRequest
): Promise<MarkovdManagedStopCompletion> {
  return MarkovdManagedStopCompletionSchema.parse(
    await runSlotCommand(options, request, MARKOVD_COMPLETE_MANAGED_STOP_FLAG)
  )
}

export async function cancelRemoteMarkovdManagedStop(
  options: MarkovdSlotOptions,
  request: MarkovdManagedStopRequest
): Promise<MarkovdManagedStopCancellation> {
  return MarkovdManagedStopCancellationSchema.parse(
    await runSlotCommand(options, request, MARKOVD_CANCEL_MANAGED_STOP_FLAG)
  )
}

// The slot's own build owns its stop-request format.
async function runSlotCommand(
  options: MarkovdSlotOptions,
  request: MarkovdManagedStopRequest,
  flag: string
): Promise<unknown> {
  const slotDir = markovdSlotDir(options, request.version)
  const entry = joinRemotePath(options.host, slotDir, 'markovd.js')
  const output = isWindowsRemoteHost(options.host)
    ? await runWindowsSlotCommand(options, slotDir, entry, request, flag)
    : await execMarkovdRemote(
        options,
        `${selectMarkovdSlotRuntimeCommand(options.host, slotDir, options.nodePath)} && ` +
          `"$markovd_runtime" ${quotePosixShell(entry)} ${flag} ${quotePosixShell(JSON.stringify(request))}`
      )
  const line = output
    .trim()
    .split('\n')
    .findLast((candidate) => candidate.trim().startsWith('{'))
  if (!line) {
    throw new Error('markovd managed stop command returned no verifiable answer')
  }
  const parsed: unknown = JSON.parse(line)
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('markovd managed stop command returned no verifiable answer')
  }
  if (!('transactionId' in parsed) || parsed.transactionId !== request.transactionId) {
    throw new Error('markovd managed stop command answered another transaction')
  }
  return parsed
}

// Stage JSON on Windows to avoid two command-line quoting layers.
async function runWindowsSlotCommand(
  options: MarkovdSlotOptions,
  slotDir: string,
  entry: string,
  request: MarkovdManagedStopRequest,
  flag: string
): Promise<string> {
  const runtime = readMarkovdWindowsEncodedAnswer(
    await execMarkovdRemote(
      options,
      markovdWindowsSlotOpCommand(options.host, slotDir, 'slot-runtime', [slotDir])
    ),
    MARKOVD_WINDOWS_RUNTIME_MARKER
  )
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this markovd slot needs.')
  }
  const staged = joinRemotePath(options.host, slotDir, `.markovd-stop-command-${randomUUID()}.json`)
  let removeStaged = true
  try {
    await options.conn.writeFile(staged, JSON.stringify(request), {
      hostPlatform: options.host,
      signal: options.signal
    })
    return await execMarkovdRemote(
      options,
      markovdWindowsNodeCommandLine(runtime, [
        entry,
        flag,
        MARKOVD_MANAGED_STOP_REQUEST_FILE_FLAG,
        staged
      ])
    )
  } catch (error) {
    // Unconfirmed commands may still be reading the staged request.
    removeStaged = !isUnconfirmedSshCommandTermination(error)
    throw error
  } finally {
    if (removeStaged) {
      await execMarkovdRemote(
        options,
        markovdWindowsSlotOpCommand(options.host, slotDir, 'remove-file', [staged])
      ).catch(() => {})
    }
  }
}
