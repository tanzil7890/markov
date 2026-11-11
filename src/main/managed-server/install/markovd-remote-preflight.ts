import { randomUUID } from 'node:crypto'
import { MARKOVD_NODE_RUNTIME_IDENTITY } from '../../../shared/markovd-node-runtime-identity'
import { MARKOVD_NODE_RUNTIME_MARKER_FILENAME } from '../../../shared/markovd-artifacts'
import {
  MARKOVD_PROFILE_PREFLIGHT_FLAG,
  MARKOVD_PROFILE_PREFLIGHT_TIMEOUT_MS,
  parseMarkovdProfilePreflight,
  type MarkovdProfilePreflightResponse
} from '../../../shared/markovd-profile-preflight'
import { assertPosixMarkovdHost } from './markovd-remote-host-support'
import {
  markovdWindowsNodeCommandLine,
  markovdWindowsSlotOpCommand,
  readMarkovdWindowsEncodedAnswer
} from './markovd-remote-windows-node'
import { readWindowsMarkovdSlotEntry } from './markovd-remote-launch-windows'
import { MARKOVD_WINDOWS_RUNTIME_MARKER } from '../host-state/markovd-windows-host-script'
import {
  markovdNodeSlotRuntimeCommand,
  selectMarkovdSlotEntryCommand
} from './markovd-remote-runtime'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'

export function markovdProfilePreflightCommand(
  host: RemoteHostPlatform,
  directory: string,
  nonce: string,
  probeDaemonsUnder?: string
): string {
  assertPosixMarkovdHost(host)
  // New candidates always use pinned Node; host Node fallback could mask an incomplete slot.
  const marker = quotePosixShell(
    joinRemotePath(host, directory, MARKOVD_NODE_RUNTIME_MARKER_FILENAME)
  )
  const launch = [
    'MARKOV_BACKGROUND_LAUNCH=1',
    '"$markovd_runtime"',
    '"$markovd_entry"',
    MARKOVD_PROFILE_PREFLIGHT_FLAG,
    quotePosixShell(nonce),
    ...(probeDaemonsUnder === undefined ? [] : [quotePosixShell(probeDaemonsUnder)])
  ].join(' ')
  return `[ -e ${marker} ] || exit 78; ${markovdNodeSlotRuntimeCommand(host, directory)}${selectMarkovdSlotEntryCommand(host, directory)}; ${launch}`
}

/** Qualify the candidate; given the served data root, it also names the daemon generations alive there. */
export async function preflightInstalledMarkovd(options: {
  conn: MarkovdHostTransport
  host: RemoteHostPlatform
  remoteInstallDir: string
  probeDaemonsUnder?: string
  fullVersion: string
  signal?: AbortSignal
}): Promise<MarkovdProfilePreflightResponse> {
  const nonce = randomUUID()
  const command = isWindowsRemoteHost(options.host)
    ? await windowsMarkovdProfilePreflightCommand(options, nonce)
    : markovdProfilePreflightCommand(
        options.host,
        options.remoteInstallDir,
        nonce,
        options.probeDaemonsUnder
      )
  const output = await execCommand(options.conn, command, {
    signal: options.signal,
    timeoutMs: MARKOVD_PROFILE_PREFLIGHT_TIMEOUT_MS,
    wrapCommand: !isWindowsRemoteHost(options.host)
  })
  return parseMarkovdProfilePreflight(
    output,
    nonce,
    MARKOVD_NODE_RUNTIME_IDENTITY,
    options.fullVersion
  )
}

// Windows uses plain argv; markovd opens no window and needs no background-launch environment.
async function windowsMarkovdProfilePreflightCommand(
  options: {
    conn: MarkovdHostTransport
    host: RemoteHostPlatform
    remoteInstallDir: string
    probeDaemonsUnder?: string
    signal?: AbortSignal
  },
  nonce: string
): Promise<string> {
  const { host, remoteInstallDir } = options
  const slotAnswer = await execCommand(
    options.conn,
    markovdWindowsSlotOpCommand(host, remoteInstallDir, 'slot-runtime', [remoteInstallDir]),
    { signal: options.signal, wrapCommand: false }
  )
  const runtime = readMarkovdWindowsEncodedAnswer(slotAnswer, MARKOVD_WINDOWS_RUNTIME_MARKER)
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this markovd slot needs.')
  }
  return markovdWindowsNodeCommandLine(runtime, [
    readWindowsMarkovdSlotEntry(slotAnswer, host, remoteInstallDir),
    MARKOVD_PROFILE_PREFLIGHT_FLAG,
    nonce,
    ...(options.probeDaemonsUnder === undefined ? [] : [options.probeDaemonsUnder])
  ])
}
