/** Check snapshot room before stopping a serving incumbent (#30491). */
import { markovdRemoteBaseDir } from '../managed-server/install/markovd-remote-windows-node'
import { execMarkovdRemoteOr } from '../managed-server/install/markovd-remote-runtime-control'
import {
  MARKOVD_STATE_SNAPSHOT_DIR,
  type MarkovdActivationRecord
} from '../managed-server/activation/markovd-activation-record'
import {
  markovdSnapshotShortfallKb,
  markovdSnapshotShortfallMessage,
  markovdSnapshotSpaceCommand,
  parseMarkovdSnapshotSpace
} from '../managed-server/host-state/markovd-state-snapshot-space'
import { joinRemotePath } from './ssh-remote-platform'
import { isUnconfirmedSshCommandTermination } from './remote-exec/remote-exec-command'
import type { MarkovdSlotOptions } from './markovd-recovery-slot'

export const MARKOVD_SNAPSHOT_SPACE_INSUFFICIENT_CODE = 'markovd_snapshot_space_insufficient'

export function markovdSnapshotsRoot(
  options: Pick<MarkovdSlotOptions, 'host' | 'remoteHome'>
): string {
  return joinRemotePath(
    options.host,
    markovdRemoteBaseDir(options.host, options.remoteHome),
    MARKOVD_STATE_SNAPSHOT_DIR
  )
}

/** Unknown room proceeds to authoritative capture; return a refusal only for proven insufficient space. */
export async function markovdSnapshotRoomRefusal(
  options: MarkovdSlotOptions,
  record: MarkovdActivationRecord,
  fullVersion: string
): Promise<string | null> {
  const baseDir = markovdRemoteBaseDir(options.host, options.remoteHome)
  const command = markovdSnapshotSpaceCommand(
    options.host,
    options.userDataDir,
    markovdSnapshotsRoot(options),
    baseDir,
    record.snapshot ? [record.snapshot.dirName] : []
  )
  if (!command) {
    return null
  }
  const space = parseMarkovdSnapshotSpace(await measureRoom(options, command))
  const shortfall = markovdSnapshotShortfallKb(space)
  return space && shortfall !== null
    ? markovdSnapshotShortfallMessage(space, shortfall, {
        userDataDir: options.userDataDir,
        baseDir,
        fullVersion,
        active: record.active
      })
    : null
}

async function measureRoom(options: MarkovdSlotOptions, command: string): Promise<string> {
  try {
    return await execMarkovdRemoteOr(options, command)
  } catch (error) {
    // Unconfirmed read-only cleanup leaves room unknown; capture decides, unless caller cancelled.
    if (isUnconfirmedSshCommandTermination(error) && !options.signal?.aborted) {
      return ''
    }
    throw error
  }
}
