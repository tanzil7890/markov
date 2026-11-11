import process from 'node:process'
import { profileStateAccessMachineIdentity } from '../persistence/profile-state/profile-state-access-identity'
import { readMarkovdProcessIncarnation } from './markovd-process-start-time'
import { MarkovdInstanceLockError } from './markovd-data-root-privacy'
import {
  markovdCloneMachineHint,
  markovdPeerIsLiveCloneMachine
} from './markovd-lock-clone-machine'
import {
  markovdStaleLockReclaimCommand,
  type MarkovdReclaimHintRuntime
} from '../../shared/markovd-stale-lock-reclaim'

/** Match machine identity, then legacy boot identity; identity-less records require local-only storage. */
export function markovdLockHolderLocality(
  holder: MarkovdPeerMachine,
  self: MarkovdPeerMachine,
  dataRootIsOnLocalDisk: () => boolean,
  platform: NodeJS.Platform = process.platform
): 'local' | 'foreign' | 'unknown' {
  if (holder.machineIdentity && self.machineIdentity) {
    if (holder.machineIdentity !== self.machineIdentity) {
      return 'foreign'
    }
    return markovdPeerIsLiveCloneMachine(holder, self, dataRootIsOnLocalDisk, platform)
      ? 'unknown'
      : 'local'
  }
  if (holder.bootId && holder.bootId === self.bootId) {
    return 'local'
  }
  return dataRootIsOnLocalDisk() ? 'local' : 'unknown'
}

export type MarkovdPeerMachine = {
  machineIdentity?: string
  bootId?: string
  /** Latest of the record's own timestamp and its heartbeat mtime. */
  writtenAtMs?: number
  bootStartedAtMs?: number
  nowMs?: number
}

export function currentMarkovdPeerMachine(): MarkovdPeerMachine {
  const machineIdentity = profileStateAccessMachineIdentity()
  const bootId = readMarkovdProcessIncarnation(process.pid)?.bootId
  return { ...(machineIdentity ? { machineIdentity } : {}), ...(bootId ? { bootId } : {}) }
}

/** PIDs require a provable machine and boot match; unknown peers are never assumed exited. */
export function markovdPeerPidIsJudgeableHere(
  peer: MarkovdPeerMachine,
  self: MarkovdPeerMachine,
  dataRootIsOnLocalDisk: () => boolean
): boolean {
  if (peer.bootId && self.bootId && peer.bootId !== self.bootId) {
    return false
  }
  return markovdLockHolderLocality(peer, self, dataRootIsOnLocalDisk) === 'local'
}

export function markovdLockHolderUnverifiableError(lock: {
  holder: string
  foreign: boolean
  /** The holder runs on another machine that reports this machine-id. */
  cloneMachine?: { role: 'markovd' | 'desktop' }
  dataRoot: string
  lockPath: string
  /** Managed hosts may lack launchers on PATH, so name this runtime/entry in reclaim hints. */
  hintRuntime: MarkovdReclaimHintRuntime | null
}): MarkovdInstanceLockError {
  const command = markovdStaleLockReclaimCommand(lock.dataRoot, lock.hintRuntime)
  const reclaim =
    process.platform === 'linux'
      ? `run \`${command}\` on the machine it ran on to check and clear it, or `
      : ''
  const cloneHint = lock.cloneMachine ? ` ${markovdCloneMachineHint(lock.cloneMachine.role)}` : ''
  return new MarkovdInstanceLockError(
    'markovd_instance_lock_holder_unverifiable',
    `${lock.holder} holds the data root ${lock.dataRoot}${lock.foreign || lock.cloneMachine ? ' from another machine' : ''}. ` +
      'Markov cannot check from here whether it is still running, because this data root may be ' +
      `shared with other machines. Stop it there. If it is not running anywhere, ${reclaim}` +
      `delete ${lock.lockPath} once you are sure.${cloneHint}`
  )
}
