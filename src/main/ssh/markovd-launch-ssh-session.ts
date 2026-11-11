/** macOS pins Local Network attribution at spawn: SSH-launched terminals can lose LAN access after sshd-session exits (#25934; Apple TN3179). Record the nearest session plus start time and matching slot PID; preserve earlier attribution while a live terminal daemon survives markovd restarts. */
import { quotePosixShell } from '../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath, type RemoteHostPlatform } from './ssh-remote-platform'
import { MARKOVD_PID_FILENAME } from '../managed-server/install/markovd-remote-host-support'

export const MARKOVD_LAUNCH_SSH_SESSION_FILENAME = '.markovd-launch-ssh-session'

const LOCAL_NETWORK_PRIVACY_MAJOR = 15
// Bounds the ancestor walk; real chains are a few processes deep.
const MAX_ANCESTOR_DEPTH = 32

export function recordsMarkovdLaunchSshSession(host: RemoteHostPlatform): boolean {
  return host.os === 'darwin'
}

/** Choose the nearest sshd ancestor, which exits with this session; a listener farther up would remain alive. */
export function markovdSshSessionAncestorShellFunction(): string {
  return (
    'markovd_ssh_session() { markovd_sp=$1; markovd_si=0; ' +
    `while [ "$markovd_si" -lt ${MAX_ANCESTOR_DEPTH} ]; do ` +
    'case "$markovd_sp" in "" | *[!0-9]* | 0 | 1) return 1;; esac; ' +
    'markovd_sc=$(ps -o comm= -p "$markovd_sp" 2>/dev/null) || return 1; ' +
    'case "${markovd_sc##*/}" in sshd*) ' +
    'markovd_ss=$(ps -o lstart= -p "$markovd_sp" 2>/dev/null) || return 1; ' +
    // Why unquoted: normalizes lstart's padding so a later read compares equal.
    'echo "$markovd_sp" $markovd_ss; return 0;; esac; ' +
    'markovd_sp=$(ps -o ppid= -p "$markovd_sp" 2>/dev/null | tr -d " "); ' +
    'markovd_si=$((markovd_si + 1)); done; return 1; };'
  )
}

/** Capture before detach without failing launch. */
export function captureMarkovdLaunchSshSessionCommand(): string {
  return (
    `${markovdSshSessionAncestorShellFunction()} ` +
    'markovd_session=$(markovd_ssh_session "$$" 2>/dev/null) || markovd_session=;'
  )
}

function recordPath(host: RemoteHostPlatform, userDataDir: string): string {
  return quotePosixShell(joinRemotePath(host, userDataDir, MARKOVD_LAUNCH_SSH_SESSION_FILENAME))
}

/** Return 0 for this root's live daemon, 1 for absence, 2 for unreadable argv; PID files alone may name recycled processes. */
function liveDaemonShellFunction(host: RemoteHostPlatform, userDataDir: string): string {
  const daemonDir = quotePosixShell(joinRemotePath(host, userDataDir, 'daemon'))
  return (
    `markovd_daemon_live() { markovd_ddir=${daemonDir}; for markovd_df in "$markovd_ddir"/daemon-v*.pid; do ` +
    '[ -f "$markovd_df" ] || continue; ' +
    'markovd_dp=$(sed -n \'s/.*"pid":\\([0-9][0-9]*\\).*/\\1/p\' "$markovd_df" | head -n 1); ' +
    '[ -n "$markovd_dp" ] || continue; ' +
    'kill -0 "$markovd_dp" 2>/dev/null || continue; ' +
    'markovd_da=$(ps -o args= -p "$markovd_dp" 2>/dev/null); [ -n "$markovd_da" ] || return 2; ' +
    'case "$markovd_da" in *daemon-entry*"$markovd_ddir"* | *"$markovd_ddir"*daemon-entry*) return 0;; esac; ' +
    'done; return 1; };'
  )
}

/** After recording $!, preserve the live daemon's earlier session; otherwise record this launch's session. */
export function writeMarkovdLaunchSshSessionCommand(
  host: RemoteHostPlatform,
  userDataDir: string
): string {
  const file = recordPath(host, userDataDir)
  return (
    // First-deploy detach may run before markovd creates its data root.
    `{ markovd_bg=$!; ( umask 077; mkdir -p ${quotePosixShell(userDataDir)} ); ` +
    `${liveDaemonShellFunction(host, userDataDir)} ` +
    'markovd_daemon_live; markovd_dl=$?; ' +
    'if [ "$markovd_dl" = 0 ]; then ' +
    `markovd_prev=$(cat ${file}); rm -f ${file}; set -- $markovd_prev; ` +
    `[ "$#" -lt 3 ] || { shift; ( umask 077; echo "$markovd_bg" "$@" > ${file} ); }; ` +
    // Unreadable daemon identity leaves attribution unknown, never assigned to this launch.
    `elif [ "$markovd_dl" = 2 ]; then rm -f ${file}; ` +
    `else rm -f ${file}; [ -z "$markovd_session" ] || ` +
    `( umask 077; echo "$markovd_bg" $markovd_session > ${file} ); fi; :; } 2>/dev/null`
  )
}

export function markovdLaunchSshSessionProbeCommand(
  host: RemoteHostPlatform,
  remoteInstallDir: string,
  userDataDir: string
): string {
  const file = recordPath(host, userDataDir)
  const pidFile = quotePosixShell(joinRemotePath(host, remoteInstallDir, MARKOVD_PID_FILENAME))
  return [
    'markovd_mac=$(sw_vers -productVersion 2>/dev/null) || { echo NOT_APPLICABLE; exit 0; };',
    'markovd_major=${markovd_mac%%.*};',
    'case "$markovd_major" in "" | *[!0-9]*) echo UNVERIFIABLE; exit 0;; esac;',
    `[ "$markovd_major" -ge ${LOCAL_NETWORK_PRIVACY_MAJOR} ] || { echo NOT_APPLICABLE; exit 0; };`,
    `markovd_rec=$(cat ${file} 2>/dev/null) || { echo NOT_RECORDED; exit 0; };`,
    `markovd_pid=$(cat ${pidFile} 2>/dev/null);`,
    'set -- $markovd_rec;',
    'case "$1:$2" in *[!0-9:]* | :* | *:) echo NOT_RECORDED; exit 0;; esac;',
    '[ "$1" = "$markovd_pid" ] || { echo NOT_RECORDED; exit 0; };',
    'markovd_sshd=$2; shift 2; markovd_want=$*;',
    // A ps that can't list this shell can't prove another process absent.
    'ps -o pid= -p "$$" >/dev/null 2>&1 || { echo UNVERIFIABLE; exit 0; };',
    'markovd_now=$(ps -o lstart= -p "$markovd_sshd" 2>/dev/null); markovd_now=$(echo $markovd_now);',
    // A reused PID with another start time is a different process: the session is gone.
    'if [ -z "$markovd_now" ] || [ "$markovd_now" != "$markovd_want" ]; then echo EXITED; else echo LIVE; fi'
  ].join(' ')
}

/** `not-recorded` covers older launches and clients: the condition is unknown, never assumed. */
export type MarkovdLaunchSshSession =
  | 'live'
  | 'exited'
  | 'unverifiable'
  | 'not-recorded'
  | 'not-applicable'

export function parseMarkovdLaunchSshSession(output: string): MarkovdLaunchSshSession {
  switch (output.trim().split('\n').pop()?.trim() ?? '') {
    case 'LIVE':
      return 'live'
    case 'EXITED':
      return 'exited'
    case 'NOT_RECORDED':
      return 'not-recorded'
    case 'NOT_APPLICABLE':
      return 'not-applicable'
    default:
      return 'unverifiable'
  }
}
