// Unreadable activation records must fail closed; treating them as absent could overwrite a live install and its rollback target.
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import { RELAY_REMOTE_DIR } from '../../ssh/remote-exec/remote-frame-protocol'
import {
  MARKOVD_ACTIVATION_FILENAME,
  emptyMarkovdActivationRecord,
  parseMarkovdActivationRecord,
  serializeMarkovdActivationRecord,
  type MarkovdActivationReadResult,
  type MarkovdActivationRecord
} from './markovd-activation-record'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import {
  readBoundedMarkovdRemoteRecord,
  writeAtomicMarkovdRemoteRecord
} from '../install/markovd-remote-record-file'

const MARKOVD_ACTIVATION_RECORD_MAX_BYTES = 64 * 1024

type ActivationRecordTarget = {
  conn: MarkovdHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  signal?: AbortSignal
}

export function markovdActivationPath(host: RemoteHostPlatform, remoteHome: string): string {
  return joinRemotePath(host, remoteHome, RELAY_REMOTE_DIR, MARKOVD_ACTIVATION_FILENAME)
}

async function readActivationRecordState(
  options: ActivationRecordTarget
): Promise<MarkovdActivationReadResult> {
  const read = await readBoundedMarkovdRemoteRecord(
    options,
    markovdActivationPath(options.host, options.remoteHome),
    MARKOVD_ACTIVATION_RECORD_MAX_BYTES
  )
  return read.state === 'absent' ? read : parseMarkovdActivationRecord(read.raw)
}

export async function readMarkovdActivationRecord(
  options: ActivationRecordTarget
): Promise<MarkovdActivationRecord> {
  const parsed = await readActivationRecordState(options)
  if (parsed.state === 'ok') {
    return parsed.record
  }
  if (parsed.state === 'unreadable') {
    throw new Error(`Cannot read this host's markovd activation record: ${parsed.reason}`)
  }
  return emptyMarkovdActivationRecord()
}

/** Refuse replacement of unreadable records, including schemas written by newer clients. */
export async function writeMarkovdActivationRecord(
  options: ActivationRecordTarget,
  record: MarkovdActivationRecord
): Promise<void> {
  const existing = await readActivationRecordState(options)
  if (existing.state === 'unreadable') {
    throw new Error(
      `Refusing to overwrite this host's markovd activation record: ${existing.reason}`
    )
  }
  await writeAtomicMarkovdRemoteRecord(
    options,
    markovdActivationPath(options.host, options.remoteHome),
    serializeMarkovdActivationRecord(record)
  )
}
