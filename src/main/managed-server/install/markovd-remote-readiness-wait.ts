// Wait on-host in one bounded exec; repeated SSH polling spawned process bursts and triggered Windows EDR.
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'
import {
  MARKOVD_PID_FILENAME,
  MARKOVD_PID_MACHINE_FILENAME,
  MARKOVD_READINESS_FILENAME,
  MARKOVD_READINESS_MAX_BYTES,
  MARKOVD_LAUNCH_MACHINE_COMMAND
} from './markovd-remote-host-support'
import {
  parseMarkovdReadinessOutput,
  readMarkovdReadinessCommand,
  type MarkovdReadinessParse
} from './markovd-remote-launch'
import {
  markovdWindowsSlotOpCommand,
  readMarkovdWindowsEncodedAnswer
} from './markovd-remote-windows-node'
import { MARKOVD_WINDOWS_READINESS_MARKER } from '../host-state/markovd-windows-host-script'

// Stay below the 30-second exec timeout so waits can answer before channel expiry.
export const MARKOVD_READINESS_WAIT_MAX_SECONDS = 20

const MARKOVD_LAUNCH_EXITED_MARKER = 'MARKOVD_LAUNCH_EXITED'

function posixReadinessWaitCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  waitSeconds: number
): string {
  const file = quotePosixShell(joinRemotePath(host, remoteInstallDir, MARKOVD_READINESS_FILENAME))
  const read = `head -c ${MARKOVD_READINESS_MAX_BYTES + 1} ${file} 2>/dev/null`
  const pidFile = quotePosixShell(joinRemotePath(host, remoteInstallDir, MARKOVD_PID_FILENAME))
  const pidMachine = quotePosixShell(
    joinRemotePath(host, remoteInstallDir, MARKOVD_PID_MACHINE_FILENAME)
  )
  return [
    // Fail early only on proven exit from the launching machine; shared homes and unverified PIDs must keep waiting.
    `markovd_launch_here() { markovd_recorded=$(cat ${pidMachine} 2>/dev/null) && [ -n "$markovd_recorded" ] && [ "$markovd_recorded" = "$(${MARKOVD_LAUNCH_MACHINE_COMMAND} 2>/dev/null)" ]; };`,
    `markovd_launch_exited() { markovd_launch_here || return 1; pid=$(cat ${pidFile} 2>/dev/null); case "$pid" in "" | *[!0-9]*) return 1;; esac;`,
    'probe_error=$(LC_ALL=C kill -0 "$pid" 2>&1) || { case "$probe_error" in *"No such process"*) return 0;; esac; return 1; };',
    'case "$(ps -o stat= -p "$pid" 2>/dev/null)" in Z*) return 0;; esac; return 1; };',
    // Probe fractional sleep once; POSIX hosts may support only integer seconds.
    'if sleep 0.25 2>/dev/null; then markovd_readiness_wait_step=0.25;',
    'else markovd_readiness_wait_step=1; fi;',
    // Bound elapsed time, not iterations: slow filesystem reads otherwise overrun the client exec deadline.
    `markovd_readiness_wait_end=$(($(date +%s) + ${waitSeconds}));`,
    'while [ "$(date +%s)" -lt "$markovd_readiness_wait_end" ]; do',
    `[ "$(${read} | wc -l)" -gt 0 ] && break;`,
    `[ "$(${read} | wc -c)" -gt ${MARKOVD_READINESS_MAX_BYTES} ] && break;`,
    `markovd_launch_exited && { echo ${MARKOVD_LAUNCH_EXITED_MARKER}; break; };`,
    'sleep "$markovd_readiness_wait_step"; done;',
    `${read} || true`
  ].join(' ')
}

export function markovdReadinessWaitCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  waitSeconds: number
): string {
  const seconds = Math.max(0, Math.min(MARKOVD_READINESS_WAIT_MAX_SECONDS, Math.ceil(waitSeconds)))
  if (!isWindowsRemoteHost(host)) {
    return posixReadinessWaitCommand(host, remoteInstallDir, seconds)
  }
  return markovdWindowsSlotOpCommand(host, remoteInstallDir, 'readiness-wait', [
    joinRemotePath(host, remoteInstallDir, MARKOVD_READINESS_FILENAME),
    String(MARKOVD_READINESS_MAX_BYTES),
    String(seconds)
  ])
}

export function parseMarkovdReadinessWaitOutput(
  host: RemoteHostPlatform,
  output: string
): MarkovdReadinessParse {
  return parseMarkovdReadinessOutput(
    isWindowsRemoteHost(host)
      ? (readMarkovdWindowsEncodedAnswer(output, MARKOVD_WINDOWS_READINESS_MARKER) ?? '')
      : withoutLaunchExitedMarker(output)
  )
}

export function markovdLaunchExitedDuringWait(host: RemoteHostPlatform, output: string): boolean {
  return !isWindowsRemoteHost(host) && output.startsWith(`${MARKOVD_LAUNCH_EXITED_MARKER}\n`)
}

function withoutLaunchExitedMarker(output: string): string {
  return output.startsWith(`${MARKOVD_LAUNCH_EXITED_MARKER}\n`)
    ? output.slice(MARKOVD_LAUNCH_EXITED_MARKER.length + 1)
    : output
}

export function readMarkovdReadinessNowCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string
): string {
  // Windows host wait with zero delay substitutes for the unavailable head command.
  return isWindowsRemoteHost(host)
    ? markovdReadinessWaitCommand(host, remoteInstallDir, 0)
    : readMarkovdReadinessCommand(host, remoteInstallDir)
}
