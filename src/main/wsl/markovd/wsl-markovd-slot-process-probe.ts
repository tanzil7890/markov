/** Whether any process runs from a markovd slot: its server, or a terminal daemon a candidate spawned there, which outlives the candidate's stop. */
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { posixProcessArgsShellFunction } from '../../managed-server/install/markovd-remote-host-support'
import { isMarkovdInstallDirLive } from '../../managed-server/install/markovd-remote-gc'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'

// Every shell running this probe carries it in argv, so the probe never counts itself.
const PROBE_MARKER = '__MARKOV_SLOT_PROCESS_PROBE__'

/** Prints LIVE, DEAD or UNKNOWN; anything unreadable is UNKNOWN. */
export function wslMarkovdSlotProcessProbeCommand(
  host: RemoteHostPlatform,
  slotDir: string,
  userDataDir: string
): string {
  const slot = quotePosixShell(`${slotDir.replace(/\/+$/u, '')}/`)
  const daemonDir = quotePosixShell(joinRemotePath(host, userDataDir, 'daemon'))
  const inSlot =
    'grep -F -e "$markovd_slot" -e "$markovd_real/" | ' + `grep -vF -- ${PROBE_MARKER} | grep -q .`
  return [
    `markovd_slot=${slot}; markovd_ddir=${daemonDir}; : ${PROBE_MARKER};`,
    // Node realpaths its entry, so a daemon behind a symlinked home names the resolved slot.
    'markovd_real=$(cd "$markovd_slot" 2>/dev/null && pwd -P) && [ -n "$markovd_real" ] || { echo UNKNOWN; exit 0; };',
    posixProcessArgsShellFunction(),
    // A live daemon whose pid file names it must be identified, not skipped.
    'for markovd_df in "$markovd_ddir"/daemon-v*.pid; do [ -f "$markovd_df" ] || continue;',
    'markovd_dp=$(sed -n \'s/.*"pid":\\([0-9][0-9]*\\).*/\\1/p\' "$markovd_df" | head -n 1);',
    '[ -n "$markovd_dp" ] || continue; kill -0 "$markovd_dp" 2>/dev/null || continue;',
    'markovd_da=$(markovd_args "$markovd_dp") || { echo UNKNOWN; exit 0; };',
    `printf '%s\\n' "$markovd_da" | ${inSlot} && { echo LIVE; exit 0; };`,
    'done;',
    // Capture first so the filters below never list themselves.
    'if markovd_all=$(ps -ww -eo args= 2>/dev/null) && [ -n "$markovd_all" ]; then :;',
    'elif [ -r /proc/self/cmdline ]; then',
    'markovd_all=$(for markovd_p in /proc/[0-9]*; do tr "\\000" " " < "$markovd_p/cmdline" 2>/dev/null; echo; done);',
    'else echo UNKNOWN; exit 0; fi;',
    `if printf '%s\\n' "$markovd_all" | ${inSlot}; then echo LIVE; else echo DEAD; fi`
  ].join(' ')
}

/** True unless both the server's pid file and a process scan prove nothing runs from the slot. */
export async function isWslMarkovdSlotInUse(
  slot: MarkovdSlotOptions,
  slotDir: string
): Promise<boolean> {
  if (await isMarkovdInstallDirLive(slot, slotDir)) {
    return true
  }
  try {
    const answer = await execCommand(
      slot.conn,
      wslMarkovdSlotProcessProbeCommand(slot.host, slotDir, slot.userDataDir),
      { wrapCommand: true, signal: slot.signal }
    )
    return answer.trim().split('\n').at(-1)?.trim() !== 'DEAD'
  } catch (error) {
    if (isUnconfirmedSshCommandTermination(error)) {
      throw error
    }
    return true
  }
}
