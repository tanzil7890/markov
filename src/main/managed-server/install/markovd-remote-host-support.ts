// Windows operations use the host script; only POSIX command builders use this guard.
import { isWindowsRemoteHost, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'

export class MarkovdRemoteLaunchUnsupportedError extends Error {
  readonly code = 'markovd_remote_launch_unsupported_host'
  constructor(hostLabel: string) {
    super(
      `This markovd command does not run on a ${hostLabel} host. The install transaction is ` +
        'host-agnostic, but this step is a POSIX command with a separate Windows path.'
    )
    this.name = 'MarkovdRemoteLaunchUnsupportedError'
  }
}

export function assertPosixMarkovdHost(host: RemoteHostPlatform): void {
  if (isWindowsRemoteHost(host)) {
    throw new MarkovdRemoteLaunchUnsupportedError('Windows')
  }
}

/** Candidate stdout containing readiness; bounded below even if other output follows. */
export const MARKOVD_READINESS_FILENAME = '.markovd-readiness'
export const MARKOVD_LOG_FILENAME = 'markovd.log'
// Candidate stdout is untrusted in size; never read runaway output whole.
export const MARKOVD_READINESS_MAX_BYTES = 256 * 1024

export const MARKOVD_PID_FILENAME = '.markovd-pid'
/** Pair the PID with boot ID and node name; shared home paths cannot identify a machine. */
export const MARKOVD_PID_MACHINE_FILENAME = `${MARKOVD_PID_FILENAME}-machine`
/** Emit nothing without a boot ID; launch and later wait compare this identity. */
export const MARKOVD_LAUNCH_MACHINE_COMMAND = 'cat /proc/sys/kernel/random/boot_id&&uname -n'

/** Windows pairs PID with creation time because PID reuse alone cannot identify the process. */
export const MARKOVD_WINDOWS_PROCESS_FILENAME = '.markovd-process.json'

/** kill -0 includes zombies; ps excludes them, while missing evidence conservatively retains the process. */
export function posixProcessAliveShellFunction(
  options: { refuseUnverifiable?: boolean } = {}
): string {
  // Destructive lifecycle steps need explicit absence; permission failures cannot prove exit.
  const probe = options.refuseUnverifiable
    ? 'probe_error=$(LC_ALL=C kill -0 "$1" 2>&1) || { ' +
      'case "$probe_error" in *"No such process"*) return 1;; ' +
      '*) echo UNKNOWN; exit 0;; esac; }; '
    : 'kill -0 "$1" 2>/dev/null || return 1; '
  return (
    `markovd_alive() { ${probe}` +
    'markovd_stat=$(ps -o stat= -p "$1" 2>/dev/null) && [ -n "$markovd_stat" ] || ' +
    // Field 3 of /proc/<pid>/stat follows the last ")": comm itself may hold spaces or parens.
    'markovd_stat=$(cat "/proc/$1/stat" 2>/dev/null) && markovd_stat=${markovd_stat##*") "}; ' +
    'case "$markovd_stat" in Z*) return 1;; esac; return 0; };'
  )
}

/** Prints a PID's argv; slim Linux images ship no ps, so fall back to /proc (#34149). */
export function posixProcessArgsShellFunction(): string {
  return (
    'markovd_args() { markovd_argv=$(ps -o args= -p "$1" 2>/dev/null) && [ -n "$markovd_argv" ] || ' +
    '{ markovd_argv=$(tr "\\000" " " 2>/dev/null < "/proc/$1/cmdline") || return 1; ' +
    // Kernel threads and zombies have no argv; their stat line still names them.
    '[ -n "$markovd_argv" ] || markovd_argv=$(cat "/proc/$1/stat" 2>/dev/null) || return 1; }; ' +
    'printf "%s\\n" "$markovd_argv"; };'
  )
}
