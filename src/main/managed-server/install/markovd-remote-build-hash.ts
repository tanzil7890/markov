import { MARKOVD_LAUNCHER_FILENAME } from '../../../shared/markovd-artifacts'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { execMarkovdRemote, type MarkovdRemoteExecTarget } from './markovd-remote-runtime-control'
import { markovdWindowsSlotOpCommand } from './markovd-remote-windows-node'
import { MARKOVD_BUILD_HASH_MARKER as BUILD_HASH_MARKER } from '../host-state/markovd-windows-host-script'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'

export async function readRemoteMarkovdBuildHash(
  target: MarkovdRemoteExecTarget,
  remoteInstallDir: string
): Promise<string> {
  const output = await execMarkovdRemote(
    target,
    remoteMarkovdBuildHashCommand(target.host, remoteInstallDir)
  )
  const match = output.match(new RegExp(`${BUILD_HASH_MARKER}\\s+([a-fA-F0-9]{16})`, 'u'))
  if (!match?.[1]) {
    throw new Error('Could not verify the installed markovd build hash.')
  }
  return match[1].toLowerCase()
}

export function remoteMarkovdBuildHashCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string
): string {
  if (isWindowsRemoteHost(host)) {
    return markovdWindowsSlotOpCommand(host, remoteInstallDir, 'build-hash', [
      joinRemotePath(host, remoteInstallDir, MARKOVD_LAUNCHER_FILENAME)
    ])
  }
  const path = quotePosixShell(joinRemotePath(host, remoteInstallDir, MARKOVD_LAUNCHER_FILENAME))
  // GNU/BusyBox provide sha256sum, macOS shasum; both print the digest first.
  return [
    `[ -f ${path} ] && [ -r ${path} ] || exit 1;`,
    `markov_hash=$(if command -v sha256sum >/dev/null 2>&1; then sha256sum ${path} | awk '{print $1}';`,
    `elif command -v shasum >/dev/null 2>&1; then shasum -a 256 ${path} | awk '{print $1}'; fi);`,
    `case "$markov_hash" in [0-9a-fA-F][0-9a-fA-F]*) printf '%s %.16s\\n' ${quotePosixShell(BUILD_HASH_MARKER)} "$markov_hash";; esac`
  ].join(' ')
}
