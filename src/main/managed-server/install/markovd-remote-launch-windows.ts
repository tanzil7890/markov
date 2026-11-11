// Win32-OpenSSH kills session jobs; require native breakaway without WMI/PowerShell, then record PID plus creation time.
import {
  MARKOVD_WINDOWS_BREAKAWAY_CONTRACT,
  parseWindowsBreakawayLaunchReport,
  WINDOWS_BREAKAWAY_ENV_FLAG,
  WINDOWS_BREAKAWAY_LAUNCH_FLAG,
  WINDOWS_BREAKAWAY_PROCESS_FILE_FLAG,
  WINDOWS_BREAKAWAY_STDERR_FLAG,
  WINDOWS_BREAKAWAY_STDERR_KEEP_PREVIOUS_FLAG,
  WINDOWS_BREAKAWAY_STDOUT_FLAG
} from '../../../shared/windows-breakaway-launch'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import {
  markovdWindowsNodeCommandLine,
  markovdWindowsSlotOpCommand,
  readMarkovdWindowsEncodedAnswer
} from './markovd-remote-windows-node'
import {
  MARKOVD_WINDOWS_ENTRY_MARKER,
  MARKOVD_WINDOWS_RUNTIME_MARKER
} from '../host-state/markovd-windows-host-script'
import {
  MARKOVD_LOG_FILENAME,
  MARKOVD_READINESS_FILENAME,
  MARKOVD_WINDOWS_PROCESS_FILENAME
} from './markovd-remote-host-support'
import { markovdManagedLaunchEnv, type MarkovdLaunchSpec } from './markovd-remote-launch'
import { MARKOVD_WINDOWS_LAUNCH_REFUSED_CODE } from '../../markovd/markovd-host-unavailable'

export class MarkovdWindowsLaunchRefusedError extends Error {
  readonly code = MARKOVD_WINDOWS_LAUNCH_REFUSED_CODE
  constructor(reason: string) {
    super(
      `The Windows host refused to start markovd outside the SSH session (${reason}). markovd needs ` +
        'a job that allows breakaway and a slot with the process-tree launcher; it never falls ' +
        'back to WMI.'
    )
    this.name = 'MarkovdWindowsLaunchRefusedError'
  }
}

/** The launcher reported that it could not start markovd. */
export class MarkovdWindowsLaunchFailedError extends Error {
  constructor(detail: string) {
    super(`markovd's Windows launcher did not start the candidate: ${detail}.`)
    this.name = 'MarkovdWindowsLaunchFailedError'
  }
}

/** Resolve pinned slot runtime and remove stale instance-stop intent before launch. */
export function windowsMarkovdLaunchRuntimeCommand(
  host: RemoteHostPlatform,
  slotDir: string
): string {
  return markovdWindowsSlotOpCommand(host, slotDir, 'slot-runtime', [slotDir, 'clear-stop-request'])
}

export function readWindowsMarkovdSlotRuntime(output: string): string {
  const runtime = readMarkovdWindowsEncodedAnswer(output, MARKOVD_WINDOWS_RUNTIME_MARKER)
  if (!runtime) {
    throw new Error('The Windows host did not name the runtime this markovd slot needs.')
  }
  return runtime
}

/** Older host scripts omit entry, implying the legacy single-file launcher. */
export function readWindowsMarkovdSlotEntry(
  output: string,
  host: RemoteHostPlatform,
  slotDir: string
): string {
  return (
    readMarkovdWindowsEncodedAnswer(output, MARKOVD_WINDOWS_ENTRY_MARKER) ??
    joinRemotePath(host, slotDir, 'markovd.js')
  )
}

export function windowsMarkovdLaunchCommand(
  host: RemoteHostPlatform,
  spec: MarkovdLaunchSpec,
  slotRuntime: string,
  slotEntry = joinRemotePath(host, spec.remoteInstallDir, 'markovd.js')
): string {
  const dir = spec.remoteInstallDir
  return markovdWindowsNodeCommandLine(slotRuntime, [
    slotEntry,
    WINDOWS_BREAKAWAY_LAUNCH_FLAG,
    // CREATE_ALWAYS removes stale readiness before the launcher returns.
    WINDOWS_BREAKAWAY_STDOUT_FLAG,
    joinRemotePath(host, dir, MARKOVD_READINESS_FILENAME),
    WINDOWS_BREAKAWAY_STDERR_FLAG,
    joinRemotePath(host, dir, MARKOVD_LOG_FILENAME),
    // Preserve previous stderr for crash diagnosis across restart.
    WINDOWS_BREAKAWAY_STDERR_KEEP_PREVIOUS_FLAG,
    WINDOWS_BREAKAWAY_PROCESS_FILE_FLAG,
    joinRemotePath(host, dir, MARKOVD_WINDOWS_PROCESS_FILENAME),
    WINDOWS_BREAKAWAY_ENV_FLAG,
    `MARKOV_VERSION=${spec.fullVersion}`,
    WINDOWS_BREAKAWAY_ENV_FLAG,
    `MARKOV_USER_DATA=${spec.userDataDir}`,
    ...markovdManagedLaunchEnv(spec).flatMap(([name, value]) => [
      WINDOWS_BREAKAWAY_ENV_FLAG,
      `${name}=${value}`
    ]),
    MARKOVD_WINDOWS_BREAKAWAY_CONTRACT.argsFlag,
    '--json',
    '--bind',
    spec.bindHost,
    '--port',
    String(spec.port)
  ])
}

export function hasWindowsMarkovdLaunchReport(output: string): boolean {
  return parseWindowsBreakawayLaunchReport(MARKOVD_WINDOWS_BREAKAWAY_CONTRACT, output) !== null
}

/** Return launched PID or surface native-breakaway refusal/failure. */
export function readWindowsMarkovdLaunchReport(output: string): number {
  const report = parseWindowsBreakawayLaunchReport(MARKOVD_WINDOWS_BREAKAWAY_CONTRACT, output)
  if (report?.method === 'breakaway') {
    return report.pid
  }
  if (report?.method === 'unavailable') {
    throw new MarkovdWindowsLaunchRefusedError(
      report.step ? `${report.reason} at ${report.step}` : report.reason
    )
  }
  if (report?.method === 'failed') {
    throw new MarkovdWindowsLaunchFailedError(
      `${report.reason}${report.step ? ` at ${report.step}` : ''} (code ${String(report.code ?? 0)})`
    )
  }
  throw new Error("markovd's Windows launcher did not start the candidate: no launch report.")
}
