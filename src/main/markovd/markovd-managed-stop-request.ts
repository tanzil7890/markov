import { createHash } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readNodeFileSyncWithinLimit } from '../../shared/node-bounded-file-reader'
import {
  MARKOVD_MANAGED_STOP_REQUEST_MAX_BYTES,
  MARKOVD_MANAGED_STOP_REQUEST_PREFIX,
  MarkovdManagedStopRequestSchema,
  type MarkovdManagedStopContext,
  type MarkovdManagedStopInstance,
  type MarkovdManagedStopRequest
} from '../../shared/markovd-stop-request'
import { readMarkovdInstanceLockRecord, type MarkovdLockRecord } from './markovd-instance-lock'

/** Nonce-scoped paths prevent requests from addressing a previous instance. */
export function markovdManagedStopRequestPath(instance: MarkovdManagedStopInstance): string {
  const digest = createHash('sha256').update(instance.nonce).digest('hex')
  return join(dirname(instance.lockPath), `${MARKOVD_MANAGED_STOP_REQUEST_PREFIX}.${digest}`)
}

export function readMarkovdManagedStopRequest(path: string): MarkovdManagedStopRequest {
  if (!lstatSync(path).isFile()) {
    throw new Error('markovd_managed_stop_request_not_regular_file')
  }
  const { buffer } = readNodeFileSyncWithinLimit(path, MARKOVD_MANAGED_STOP_REQUEST_MAX_BYTES)
  return MarkovdManagedStopRequestSchema.parse(JSON.parse(buffer.toString('utf8')))
}

function sameMarkovdManagedStopInstance(
  left: MarkovdManagedStopInstance,
  right: Pick<MarkovdManagedStopInstance, 'pid' | 'startedAtMs' | 'nonce'>
): boolean {
  return (
    left.pid === right.pid && left.startedAtMs === right.startedAtMs && left.nonce === right.nonce
  )
}

export function markovdInstanceLockNames(instance: MarkovdManagedStopInstance): boolean {
  return readMarkovdInstanceLockNaming(instance) !== null
}

export function readMarkovdInstanceLockNaming(
  instance: MarkovdManagedStopInstance
): MarkovdLockRecord | null {
  if (!lstatSync(instance.lockPath).isFile()) {
    return null
  }
  const record = readMarkovdInstanceLockRecord(instance.lockPath)
  return record !== null && sameMarkovdManagedStopInstance(instance, record) ? record : null
}

export function validateMarkovdManagedStopRequest(
  context: MarkovdManagedStopContext,
  requestPath: string
): MarkovdManagedStopRequest {
  const request = readMarkovdManagedStopRequest(requestPath)
  if (
    request.version !== context.version ||
    request.runtimeId !== context.runtimeId ||
    // Windows clients and servers may use different separators for the same lock.
    resolve(request.instance.lockPath) !== resolve(context.instance.lockPath) ||
    !sameMarkovdManagedStopInstance(request.instance, context.instance)
  ) {
    throw new Error('markovd_managed_stop_request_identity_mismatch')
  }
  if (!markovdInstanceLockNames(context.instance)) {
    throw new Error('markovd_managed_stop_instance_lock_changed')
  }
  return request
}
