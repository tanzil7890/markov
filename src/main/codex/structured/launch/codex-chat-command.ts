import { hasExplicitTuiLaunchCommand } from '../../../../shared/agent-launch/startup/tui-agent-launch-command-override'
import { isAbsolute } from 'node:path'
import { managedCodexCommand } from '../../../codex-cli/codex-managed-runtime'
import {
  wholeCodexCommandInsteadOf,
  type WholeCodexSearch
} from '../../../codex-cli/whole-codex-command'
import { getProfileUserDataPath } from '../../../markov-profiles/profile-storage-paths'
import { isAgentSessionPreSpawnError } from '../../../native-chat/agent-session-wire/providers/structured-agent-session-adapter-errors'
import { guestNativePathEnv } from '../../../ipc/wsl-guest-windows-drive-path'
import {
  resolveStructuredAgentCommand,
  type StructuredAgentCommand,
  type StructuredAgentCommandSettings
} from '../../../native-chat/structured-agent-command-resolution'

/** Markov's own Codex, read from this host's data folder; null where none is installed or readable. */
function installedManagedCodexCommand(): string | null {
  try {
    return managedCodexCommand(getProfileUserDataPath())
  } catch {
    return null
  }
}

/** The Codex a chat runs: the user's Command setting exactly as given; otherwise the copy found
 *  first while it is whole, then Markov's own Codex, then a whole Codex installed elsewhere. */
export function resolveCodexChatCommand(
  settings: StructuredAgentCommandSettings,
  options: WholeCodexSearch = {}
): StructuredAgentCommand {
  const explicit = hasExplicitTuiLaunchCommand(settings, 'codex')
  const { managedCommand = explicit ? null : installedManagedCodexCommand(), ...search } = options
  let chosen: StructuredAgentCommand
  try {
    chosen = resolveStructuredAgentCommand('codex', settings, search)
  } catch (error) {
    // A host whose only Codex is unusable (a Windows copy seen from WSL) still runs Markov's own.
    if (explicit || !managedCommand || !isAgentSessionPreSpawnError(error)) {
      throw error
    }
    return { command: managedCommand, prefixArgs: [] }
  }
  if (explicit) {
    return chosen
  }
  const whole = wholeCodexCommandInsteadOf(chosen.command, {
    ...search,
    managedCommand,
    // A WSL host must not take a Windows copy reached through a drive mount.
    pathEnv: guestNativePathEnv(search.pathEnv)
  })
  if (!whole) {
    return chosen
  }
  // Only a copy that was there and passed over is worth telling the user about.
  return isAbsolute(chosen.command)
    ? { command: whole, prefixArgs: [], replaced: chosen.command }
    : { command: whole, prefixArgs: [] }
}

/** What the chat says once when it runs another copy than the one found first. */
export function codexReplacedCommandNotice(command: string, replaced: string): string {
  return (
    `Markov is running the Codex at ${command} for this chat. ` +
    `The copy at ${replaced} is missing its command helper, so it could not run commands.`
  )
}
