import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import type { SshTarget } from '../../../shared/ssh-types'
import type { MarkovdActivationRecord } from '../activation/markovd-activation-record'
import { readMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import { resolveMarkovdRuntimeTarget } from '../lifecycle/markovd-runtime-target'
import { LINUX_LIBC_FIRST_PROBE } from '../../node-runtime/linux-libc-probe'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { prepareWindowsMarkovdHost } from '../host-state/markovd-windows-host-preparation'
import {
  isWslMarkovdHostTarget,
  type MarkovdHostTarget,
  type MarkovdHostTransport
} from '../../ssh/markovd-host-transport'
import {
  decideMarkovdMachineHome,
  markovdMachineDataRoot,
  markovdMachineHomeDir,
  markovdMachineHomeProbeCommand,
  markovdMachineOwnershipUnresolvedMessage,
  parseMarkovdMachineHomeProbe
} from '../host-state/markovd-machine-home'
import {
  markovdMachineClaimCommand,
  readMarkovdMachineClaimAnswer
} from '../host-state/markovd-machine-claim-command'
import { execMarkovdRemote, type MarkovdRemoteExecTarget } from './markovd-remote-runtime-control'
import { readRemoteHomeCommand } from '../../ssh/ssh-remote-commands'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  normalizeRemoteHome,
  validateRemoteHome,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'
import { detectRemoteHostPlatform } from '../../ssh/ssh-remote-platform-detection'
import { MarkovdHostUnsupportedError } from '../../markovd/markovd-host-unavailable'
import { rememberSshHostPlatform } from '../../ssh/ssh-host-platform-memo'

/** Default SSH generic retains compatibility with lifecycle consumers requiring SSH-only fields. */
export type MarkovdRemoteContext<Target extends MarkovdHostTarget = SshTarget> = {
  activationRecord: MarkovdActivationRecord
  /** Select a compatible runtime when host glibc is below the default pin's floor. */
  serverTarget: NodeRuntimeTarget
  connection: MarkovdHostTransport
  host: RemoteHostPlatform
  /** Login or machine-specific home for shared-home isolation; userDataDir must follow the same owner. */
  remoteHome: string
  target: Target
  userDataDir: string
}

export async function resolveMarkovdRemoteContext<Target extends MarkovdHostTarget = SshTarget>(
  target: Target,
  connection: MarkovdHostTransport,
  signal?: AbortSignal,
  detectedHost?: RemoteHostPlatform,
  /**
   * Facts the caller already read on this host. `loginHome` serves only login-home placement;
   * `firstLibcProbeOutput` answers the libc probe's first command, whose fallbacks still run.
   */
  known: {
    loginHome?: string
    firstLibcProbeOutput?: string
    /** Replaces the plain activation record read; WSL reads its connect snapshot here. */
    readActivationRecord?: (
      target: MarkovdRemoteExecTarget & { remoteHome: string; userDataDir: string }
    ) => Promise<MarkovdActivationRecord>
  } = {}
): Promise<MarkovdRemoteContext<Target>> {
  const host = detectedHost ?? (await detectRemoteHostPlatform(connection, { signal }))
  if (!host) {
    throw new MarkovdHostUnsupportedError(
      isWslMarkovdHostTarget(target)
        ? 'Markov’s server doesn’t support this WSL distro’s platform. Use an x64 or arm64 Linux distro.'
        : 'Markov’s server doesn’t support this SSH host’s platform.'
    )
  }
  const remote = { conn: connection, host, signal }
  const { markovdHome: remoteHome, userDataDir } = await resolveMarkovdMachineHome(
    remote,
    !isWslMarkovdHostTarget(target),
    known.loginHome
  )
  let firstLibcProbeOutput = known.firstLibcProbeOutput
  const serverTarget = await resolveMarkovdRuntimeTarget({
    conn: connection,
    host,
    signal,
    ...(firstLibcProbeOutput === undefined
      ? {}
      : {
          exec: async (command: string) => {
            if (command === LINUX_LIBC_FIRST_PROBE && firstLibcProbeOutput !== undefined) {
              const output = firstLibcProbeOutput
              firstLibcProbeOutput = undefined
              return output
            }
            // The fallbacks run exactly as the default exec would.
            return execCommand(connection, command, { signal })
          }
        })
  })
  if (!isWslMarkovdHostTarget(target)) {
    rememberSshHostPlatform(target.id, host, serverTarget)
  }
  if (isWindowsRemoteHost(host)) {
    // Prepare pinned Node before even reading activation state on Windows.
    await prepareWindowsMarkovdHost({
      conn: connection,
      host,
      remoteHome,
      serverTarget,
      signal
    })
  }
  const activationRecord = await (known.readActivationRecord ?? readMarkovdActivationRecord)({
    ...remote,
    remoteHome,
    userDataDir
  })
  return {
    activationRecord,
    serverTarget,
    connection,
    host,
    remoteHome,
    target,
    userDataDir
  }
}

/** Resolve per-machine state for shared POSIX homes; Windows and WSL retain login-home placement. */
export async function resolveMarkovdMachineHome(
  remote: MarkovdRemoteExecTarget,
  keyByMachine: boolean,
  knownLoginHome?: string
): Promise<{ loginHome: string; markovdHome: string; userDataDir: string }> {
  const { host } = remote
  if (!keyByMachine || isWindowsRemoteHost(host)) {
    const loginHome = normalizeRemoteHome(
      knownLoginHome ?? (await execMarkovdRemote(remote, readRemoteHomeCommand(host))),
      host
    )
    if (!validateRemoteHome(loginHome, host)) {
      throw new Error(`Remote home is not a valid path: ${loginHome.slice(0, 100)}`)
    }
    return {
      loginHome,
      markovdHome: loginHome,
      userDataDir: joinRemotePath(host, loginHome, '.markov')
    }
  }
  const probe = parseMarkovdMachineHomeProbe(
    await execMarkovdRemote(remote, markovdMachineHomeProbeCommand(host)),
    host
  )
  const { loginHome } = probe
  let decision = decideMarkovdMachineHome(probe, host)
  if (decision.kind === 'unresolved') {
    throw new Error(
      markovdMachineOwnershipUnresolvedMessage(
        decision.machineKey,
        probe.identity?.hostname ?? null,
        decision.cause
      )
    )
  }
  if (decision.kind === 'claim') {
    const won = readMarkovdMachineClaimAnswer(
      await execMarkovdRemote(
        remote,
        markovdMachineClaimCommand(host, loginHome, decision.machineKey)
      )
    )
    if (won.state !== 'present') {
      throw new Error(won.message)
    }
    decision =
      won.machineKey === decision.machineKey
        ? { kind: 'login-home' }
        : { kind: 'machine-home', machineKey: decision.machineKey }
  }
  if (decision.kind === 'login-home') {
    return {
      loginHome,
      markovdHome: loginHome,
      userDataDir: joinRemotePath(host, loginHome, '.markov')
    }
  }
  const markovdHome = markovdMachineHomeDir(host, loginHome, decision.machineKey)
  await execMarkovdRemote(remote, `umask 077; mkdir -p ${quotePosixShell(markovdHome)}`)
  return {
    loginHome,
    markovdHome,
    userDataDir: markovdMachineDataRoot(host, loginHome, decision.machineKey)
  }
}
