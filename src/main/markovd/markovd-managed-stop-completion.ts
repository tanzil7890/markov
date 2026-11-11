// Request shutdown without signaling; only kernel identity, owner change or PID absence proves exit.
import { setTimeout as delay } from 'node:timers/promises'
import { writeDurableSecureJsonFile } from '../../shared/secure-file'
import {
  MarkovdManagedStopRequestSchema,
  markovdManagedStopRequestKey,
  type MarkovdManagedStopInstance,
  type MarkovdManagedStopRequest,
  type MarkovdManagedStopVerdict
} from '../../shared/markovd-stop-request'
import {
  compareMarkovdProcessIdentity,
  recordedMarkovdProcessIncarnation,
  type MarkovdProcessIdentityReaders,
  type MarkovdRecordedIdentity
} from './markovd-process-start-time'
import {
  hasErrorCode,
  inspectProcessSignal
} from '../daemon/endpoint/identity/daemon-process-inspection'
import { persistMarkovdCompletedStopReceipt } from './markovd-completed-stop-receipt'
import { readMarkovdManagedStopDecision } from './markovd-managed-stop-decision'
import { withdrawMarkovdManagedStopRequest } from './markovd-managed-stop-cancellation'
import {
  markovdInstanceLockNames,
  markovdManagedStopRequestPath,
  readMarkovdInstanceLockNaming,
  readMarkovdManagedStopRequest
} from './markovd-managed-stop-request'
import {
  MARKOVD_STOP_COMPLETION_POLL_ATTEMPTS,
  MARKOVD_STOP_COMPLETION_POLL_MS
} from './markovd-stop-deadlines'

type MarkovdProcessProbe = (pid: number) => 'alive' | 'missing' | 'unverifiable'

export type MarkovdManagedStopCompletionOptions = MarkovdProcessIdentityReaders & {
  probeProcess?: MarkovdProcessProbe
  sleep?: () => Promise<void>
  attempts?: number
  now?: () => Date
}

function defaultProbe(pid: number): ReturnType<MarkovdProcessProbe> {
  const signal = inspectProcessSignal(pid)
  // EPERM proves some process holds the PID; it cannot prove ours exited.
  return signal === 'occupied' ? 'alive' : signal === 'missing' ? 'missing' : 'unverifiable'
}

function observeInstance(
  instance: MarkovdManagedStopInstance,
  recorded: MarkovdRecordedIdentity,
  options: MarkovdManagedStopCompletionOptions
): MarkovdManagedStopVerdict {
  const probe = (options.probeProcess ?? defaultProbe)(instance.pid)
  if (probe !== 'alive') {
    return probe === 'missing' ? 'exited' : 'unverifiable'
  }
  // Wall-clock drift alone cannot prove PID reuse.
  const identity = compareMarkovdProcessIdentity(instance.pid, recorded, options)
  return identity === 'differs' ? 'exited' : identity === 'unproven' ? 'unverifiable' : 'live'
}

/** Recover incarnation data from the lock for older clients that omit it. */
function recordedIdentity(instance: MarkovdManagedStopInstance): MarkovdRecordedIdentity {
  if (recordedMarkovdProcessIncarnation(instance)) {
    return instance
  }
  let record: MarkovdRecordedIdentity | null = null
  try {
    record = readMarkovdInstanceLockNaming(instance)
  } catch {
    return instance
  }
  if (!record) {
    return instance
  }
  return { ...instance, ...recordedMarkovdProcessIncarnation(record), identity: record.identity }
}

export async function completeMarkovdManagedStop(
  input: MarkovdManagedStopRequest,
  options: MarkovdManagedStopCompletionOptions = {}
): Promise<MarkovdManagedStopVerdict> {
  const request = MarkovdManagedStopRequestSchema.parse(input)
  const attempts = options.attempts ?? MARKOVD_STOP_COMPLETION_POLL_ATTEMPTS
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 240) {
    throw new Error('markovd_managed_stop_invalid_attempts')
  }
  const completed = (): 'exited' => {
    persistMarkovdCompletedStopReceipt(request, (options.now ?? (() => new Date()))())
    return 'exited'
  }
  const recorded = recordedIdentity(request.instance)
  let verdict = observeInstance(request.instance, recorded, options)
  if (verdict !== 'live') {
    return verdict === 'exited' ? completed() : verdict
  }
  if (!lockStillNamesInstance(request.instance)) {
    // A live process that relinquished its lock is no longer ours to address.
    return 'unverifiable'
  }
  if (readMarkovdManagedStopDecision(request) === 'canceled') {
    return 'live'
  }
  const requestPath = markovdManagedStopRequestPath(request.instance)
  if (!existingRequestMatches(requestPath, request)) {
    return 'unverifiable'
  }
  if (!writeDurableSecureJsonFile(requestPath, request)) {
    throw new Error('markovd_managed_stop_request_permissions_unconfirmed')
  }
  // A cancel between the first check and write had no request file to remove.
  if (readMarkovdManagedStopDecision(request) === 'canceled') {
    withdrawMarkovdManagedStopRequest(request)
    return 'live'
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    await (options.sleep ?? (() => delay(MARKOVD_STOP_COMPLETION_POLL_MS)))()
    verdict = observeInstance(request.instance, recorded, options)
    if (verdict !== 'live') {
      return verdict === 'exited' ? completed() : verdict
    }
  }
  return 'live'
}

function lockStillNamesInstance(instance: MarkovdManagedStopInstance): boolean {
  try {
    return markovdInstanceLockNames(instance)
  } catch {
    return false
  }
}

function existingRequestMatches(path: string, request: MarkovdManagedStopRequest): boolean {
  try {
    return (
      markovdManagedStopRequestKey(readMarkovdManagedStopRequest(path)) ===
      markovdManagedStopRequestKey(request)
    )
  } catch (error) {
    return hasErrorCode(error, 'ENOENT')
  }
}
