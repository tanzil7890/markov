// Redirect detached candidate stdout to its version directory so readiness does not hold SSH open.
import type { MarkovdLaunchEnvEntry } from '../../ssh/markovd-host-transport'
import {
  MARKOVD_LAUNCHER_FILENAME,
  MARKOVD_SERVER_ENTRY_FILENAME
} from '../../../shared/markovd-artifacts'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  remoteBasename,
  remoteDirname,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'
import { RELAY_REMOTE_DIR } from '../../ssh/remote-exec/remote-frame-protocol'
import { MARKOVD_WSL_HOST_ENV } from '../../ipc/wsl-guest-windows-drive-path'
import {
  assertPosixMarkovdHost as assertPosixHost,
  MARKOVD_LOG_FILENAME,
  MARKOVD_PID_FILENAME,
  MARKOVD_LAUNCH_MACHINE_COMMAND,
  MARKOVD_PID_MACHINE_FILENAME,
  MARKOVD_READINESS_FILENAME,
  MARKOVD_READINESS_MAX_BYTES,
  posixProcessAliveShellFunction,
  posixProcessArgsShellFunction
} from './markovd-remote-host-support'
import type { ServeReadiness } from '../../server/serve-readiness'
import { selectMarkovdSlotRuntimeCommand } from './markovd-remote-runtime'
import { MARKOVD_STOP_REQUEST_FILENAME } from '../../../shared/markovd-stop-request'
import { markovdWindowsSlotOpCommand } from './markovd-remote-windows-node'
import {
  captureMarkovdLaunchSshSessionCommand,
  recordsMarkovdLaunchSshSession,
  writeMarkovdLaunchSshSessionCommand
} from '../../ssh/markovd-launch-ssh-session'
import {
  MARKOVD_E2E_IDLE_TIMEOUT_ENV,
  readMarkovdE2EIdleTimeoutMs
} from '../../../shared/markovd-idle-exit'
import { MARKOVD_MANAGED_ACTIVATION_ROOT_ENV } from '../../../shared/markovd-managed-launch-env'

export type MarkovdLaunchSpec = {
  remoteInstallDir: string
  nodePath: string
  fullVersion: string
  /** Shared across versions; rollback requires a snapshot. */
  userDataDir: string
  bindHost: string
  port: number
  /** Shared activation fence; managed SSH launches may idle out. */
  activationRoot: string
}

/** Older markovd versions ignore these launch variables. */
export function markovdManagedLaunchEnv(
  spec: MarkovdLaunchSpec,
  env: NodeJS.ProcessEnv = process.env
): [string, string][] {
  const e2eTimeout = readMarkovdE2EIdleTimeoutMs(env)
  return [
    [MARKOVD_MANAGED_ACTIVATION_ROOT_ENV, spec.activationRoot],
    ...(e2eTimeout === null
      ? []
      : [[MARKOVD_E2E_IDLE_TIMEOUT_ENV, String(e2eTimeout)] satisfies [string, string]])
  ]
}

/** WSL without systemd kills nohup children with wsl.exe --exec; use a separate session. */
export type MarkovdLaunchDetach = 'nohup' | 'setsid'

const MARKOVD_SETSID_PID_WAIT_TRIES = 100

/** Halving V8's 16 MB semi-spaces saves ~30 MB idle RSS; a CLI flag because the heap cannot be resized later. */
export const MARKOVD_RUNTIME_V8_FLAGS = '--max-semi-space-size=8'

/** Pass bind explicitly so launch policy cannot change with installed-version defaults. */
export function markovdLaunchCommand(
  host: RemoteHostPlatform,
  spec: MarkovdLaunchSpec,
  detach: MarkovdLaunchDetach = 'nohup',
  hostEnv: readonly MarkovdLaunchEnvEntry[] = []
): string {
  assertPosixHost(host)
  const dir = quotePosixShell(spec.remoteInstallDir)
  // Relative artifact paths reduce command size; every use follows the same-shell cd.
  const readiness = quotePosixShell(MARKOVD_READINESS_FILENAME)
  const log = quotePosixShell(MARKOVD_LOG_FILENAME)
  // PID writes run outside nohup’s backgrounded cd; reuse one absolute path to stay within command budgets.
  const pidFile = '"$markovd_pid"'
  // Liveness matches runtime argv against the absolute entry path.
  const entry = quotePosixShell(
    joinRemotePath(host, spec.remoteInstallDir, MARKOVD_LAUNCHER_FILENAME)
  )
  const baseDir = remoteDirname(spec.remoteInstallDir.replace(/\/+$/u, ''), host)
  // Tighten only the managed root, never an unrelated custom-slot parent.
  const privateDirs = [
    ...(remoteBasename(baseDir, host) === RELAY_REMOTE_DIR ? [baseDir] : []),
    spec.remoteInstallDir
  ]
  // Capture in the launching shell; detached subshell variables do not return here.
  const recordSession = detach === 'nohup' && recordsMarkovdLaunchSshSession(host)
  const launchEnv = [
    `MARKOV_VERSION=${quotePosixShell(spec.fullVersion)}`,
    `MARKOV_USER_DATA=${quotePosixShell(spec.userDataDir)}`,
    ...markovdManagedLaunchEnv(spec).map(([name, value]) => `${name}=${quotePosixShell(value)}`)
  ]
  return [
    `markovd_pid=${quotePosixShell(joinRemotePath(host, spec.remoteInstallDir, MARKOVD_PID_FILENAME))};`,
    // Record the launching machine before detaching; absent boot identity leaves it unverified.
    `{ ${MARKOVD_LAUNCH_MACHINE_COMMAND};}>"$markovd_pid${MARKOVD_PID_MACHINE_FILENAME.slice(MARKOVD_PID_FILENAME.length)}" 2>/dev/null;`,
    ...(recordSession ? [captureMarkovdLaunchSshSessionCommand()] : []),
    // Preserve login umask for daemon children creating user files.
    'markovd_login_umask=$(umask);',
    // Pairing-token artifacts need umask 077 from creation; semicolon also covers the external PID write.
    'umask 077;',
    // Tighten existing artifacts best-effort; umask cannot repair their modes.
    `{ chmod 700 ${privateDirs.map(quotePosixShell).join(' ')} 2>/dev/null || :; } &&`,
    `cd ${dir} &&`,
    `${selectMarkovdSlotRuntimeCommand(host, spec.remoteInstallDir, spec.nodePath)} &&`,
    // Truncate so relaunch cannot activate on the previous process’s readiness.
    `: > ${readiness} &&`,
    // Required: truncating redirects retain old file modes.
    `chmod 600 ${readiness} &&`,
    `{ chmod 600 ${pidFile} ${log} 2>/dev/null || :; } &&`,
    `rm -f ${quotePosixShell(MARKOVD_STOP_REQUEST_FILENAME)} &&`,
    ...(detach === 'setsid' ? [`rm -f ${pidFile} &&`] : []),
    ...(detach === 'setsid'
      ? setsidLaunchTail(entry, spec, readiness, log, pidFile, launchEnv, hostEnv)
      : [
          // Open redirects under 077 before restoring daemon login umask.
          '{ umask "$markovd_login_umask" &&',
          ...launchEnv,
          // exec keeps $! equal to runtime PID; in-place launcher loading also preserves older clients’ argv checks.
          `exec nohup "$markovd_runtime" $markovd_runtime_flags ${MARKOVD_RUNTIME_V8_FLAGS} ${entry}`,
          `--json --bind ${quotePosixShell(spec.bindHost)} --port ${String(spec.port)};`,
          `} > ${readiness} 2>> ${log} < /dev/null &`,
          `echo $! > ${pidFile} &&`,
          ...(recordSession
            ? [`${writeMarkovdLaunchSshSessionCommand(host, spec.userDataDir)} &&`]
            : []),
          `cat ${pidFile}`
        ])
  ].join(' ')
}

/** setsid -f exits its parent, so the exec child records $$; BusyBox uses background setsid without -f. */
function setsidLaunchTail(
  entry: string,
  spec: MarkovdLaunchSpec,
  readiness: string,
  log: string,
  pidFile: string,
  launchEnv: readonly string[],
  hostEnv: readonly MarkovdLaunchEnvEntry[]
): string[] {
  return [
    ...launchEnv,
    // Only WSL setsid launches receive this marker.
    `${MARKOVD_WSL_HOST_ENV}=1`,
    ...hostEnv.map(launchEnvAssignment),
    'sh -c \'markovd_detach() { if setsid -f true >/dev/null 2>&1; then setsid -f "$@"; ' +
      'else setsid "$@" & fi; }; markovd_detach "$@"\' markovd-detach',
    `sh -c 'echo $$ > "$1" && umask "$2" && shift 2 && exec "$@"' markovd-launch ${pidFile}`,
    '"$markovd_login_umask"',
    `"$markovd_runtime" $markovd_runtime_flags ${MARKOVD_RUNTIME_V8_FLAGS} ${entry}`,
    `--json --bind ${quotePosixShell(spec.bindHost)} --port ${String(spec.port)}`,
    `> ${readiness} 2>> ${log} < /dev/null &&`,
    `markovd_wait=0; while [ ! -s ${pidFile} ] && [ "$markovd_wait" -lt ${MARKOVD_SETSID_PID_WAIT_TRIES} ];`,
    'do sleep 0.05; markovd_wait=$((markovd_wait + 1)); done;',
    `cat ${pidFile}`
  ]
}

function launchEnvAssignment([name, value, mode]: MarkovdLaunchEnvEntry): string {
  if (mode !== 'keep-existing') {
    return `${assertEnvName(name)}=${quotePosixShell(value)}`
  }
  // Inside "${NAME:-default}" quotes are literal, so only quote-free defaults are expressible.
  if (!/^[A-Za-z0-9._=:,/-]+$/.test(value)) {
    throw new Error(`markovd_launch_env_default_invalid:${name}`)
  }
  return `${assertEnvName(name)}="\${${name}:-${value}}"`
}

function assertEnvName(name: string): string {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
    throw new Error(`markovd_launch_env_name_invalid:${name}`)
  }
  return name
}

export function readMarkovdReadinessCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string
): string {
  assertPosixHost(host)
  const readiness = quotePosixShell(
    joinRemotePath(host, remoteInstallDir, MARKOVD_READINESS_FILENAME)
  )
  return `head -c ${MARKOVD_READINESS_MAX_BYTES + 1} ${readiness} 2>/dev/null || true`
}

/** LIVE/DEAD/UNKNOWN distinguish proven state from missing/denied identity probes.
 * No PID or readiness file means NEVER_LAUNCHED, which also proves this slot has no process. */
export function markovdLivenessProbeCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string
): string {
  if (isWindowsRemoteHost(host)) {
    return markovdWindowsSlotOpCommand(host, remoteInstallDir, 'liveness', [remoteInstallDir])
  }
  const pidFile = quotePosixShell(joinRemotePath(host, remoteInstallDir, MARKOVD_PID_FILENAME))
  const readiness = quotePosixShell(
    joinRemotePath(host, remoteInstallDir, MARKOVD_READINESS_FILENAME)
  )
  const launcher = quotePosixShell(
    joinRemotePath(host, remoteInstallDir, MARKOVD_LAUNCHER_FILENAME)
  )
  const server = quotePosixShell(
    joinRemotePath(host, remoteInstallDir, MARKOVD_SERVER_ENTRY_FILENAME)
  )
  return [
    posixProcessAliveShellFunction({ refuseUnverifiable: true }),
    posixProcessArgsShellFunction(),
    // PID reuse needs argv identity; absent ps leaves conservative liveness checks to decide.
    `markovd_launcher=${launcher}; markovd_server=${server};`,
    // The probe's own shell, or the shell wrapping it, carries the slot paths in its argv; after a
    // restart either can hold the old PID. A shell elsewhere may be an older launcher's live parent.
    'markovd_reused() { { [ "$1" = "$$" ] || [ "$1" = "$PPID" ]; } && return 0; ' +
      'args=$(markovd_args "$1") && [ -n "$args" ] && ' +
      'case "$args" in *"$markovd_launcher"* | *"$markovd_server"*) return 1;; *) return 0;; esac; };',
    `pid=$(cat ${pidFile} 2>/dev/null);`,
    'case "$pid" in',
    `"" ) if [ -e ${pidFile} ] || [ -e ${readiness} ]; then echo UNKNOWN; else echo ${MARKOVD_NEVER_LAUNCHED}; fi;;`,
    '*[!0-9]* ) echo UNKNOWN;;',
    '* ) if markovd_reused "$pid"; then echo DEAD; elif markovd_alive "$pid"; then echo LIVE; else echo DEAD; fi;;',
    'esac'
  ].join(' ')
}

export const MARKOVD_NEVER_LAUNCHED = 'NEVER_LAUNCHED'

export type MarkovdLiveness = 'LIVE' | 'DEAD' | 'UNKNOWN' | typeof MARKOVD_NEVER_LAUNCHED

export function parseMarkovdLiveness(output: string): MarkovdLiveness {
  const value = output.trim().split('\n').pop()?.trim()
  return value === 'LIVE' || value === 'DEAD' || value === MARKOVD_NEVER_LAUNCHED
    ? value
    : 'UNKNOWN'
}

/** Only DEAD/NEVER_LAUNCHED permit lifecycle changes; UNKNOWN proves nothing. */
export function markovdLivenessProvenExited(liveness: MarkovdLiveness): boolean {
  return liveness === 'DEAD' || liveness === MARKOVD_NEVER_LAUNCHED
}

export function markovdLivenessAnswerBlocksGc(output: string): boolean {
  return markovdLivenessBlocksGc(parseMarkovdLiveness(output))
}

export function markovdLivenessBlocksGc(liveness: MarkovdLiveness): boolean {
  return !markovdLivenessProvenExited(liveness)
}

export type MarkovdReadinessParse =
  | { state: 'ready'; readiness: ServeReadiness }
  | { state: 'pending' }
  | { state: 'malformed'; reason: string }

/** Treat an unfinished last line as pending; polling can race a candidate stdout append. */
export function parseMarkovdReadinessOutput(raw: string): MarkovdReadinessParse {
  if (Buffer.byteLength(raw, 'utf8') > MARKOVD_READINESS_MAX_BYTES) {
    return { state: 'malformed', reason: 'readiness payload exceeds the 256 KiB limit' }
  }
  const lines = raw.split('\n')
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // Only an unterminated last line can recover from a partial write.
      return index === lines.length - 1
        ? { state: 'pending' }
        : { state: 'malformed', reason: 'readiness line is not valid JSON' }
    }
    if (typeof parsed !== 'object' || parsed === null) {
      continue
    }
    const payload = parsed as { type?: unknown }
    if (payload.type !== 'markov_server_ready') {
      return {
        state: 'malformed',
        reason: `expected a markov_server_ready line, got type=${JSON.stringify(payload.type)}`
      }
    }
    return { state: 'ready', readiness: toServeReadiness(payload as Record<string, unknown>) }
  }
  return { state: 'pending' }
}

function toServeReadiness(payload: Record<string, unknown>): ServeReadiness {
  return {
    runtimeId: typeof payload.runtimeId === 'string' ? payload.runtimeId : '',
    boundEndpoint: typeof payload.boundEndpoint === 'string' ? payload.boundEndpoint : null,
    advertisedEndpoint:
      typeof payload.advertisedEndpoint === 'string' ? payload.advertisedEndpoint : null,
    managedWslCliReconciliation:
      payload.managedWslCliReconciliation === 'pending' ||
      payload.managedWslCliReconciliation === 'failed'
        ? payload.managedWslCliReconciliation
        : 'settled',
    pairing: payload.pairing as ServeReadiness['pairing'],
    ...(payload.health ? { health: payload.health as ServeReadiness['health'] } : {})
  }
}
