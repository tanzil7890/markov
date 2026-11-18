import { closeSync, existsSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { isRunnableCommand } from '../../shared/cli-fs-reads'
import { isNativeExecutable } from '../../shared/cli-runtime-pairing-inputs'
import {
  resolveCliCommandCandidates,
  type ResolveCommandOptions
} from '../../shared/node-cli-command-resolution'

/** The program newer Codex builds run every command through; it ships beside `codex`. */
export const CODEX_COMMAND_HELPER = 'codex-code-mode-host'
const PACKAGE_FILE = 'codex-package.json'
const SCAN_CHUNK_BYTES = 4 * 1024 * 1024

// Verdict per binary as it is on disk; a reinstall changes its size or time and is read again.
const buildsStartingHelper = new Map<string, boolean>()

function helperFileName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${CODEX_COMMAND_HELPER}.exe` : CODEX_COMMAND_HELPER
}

/** Older builds run commands themselves; only a build that names the helper needs it installed. */
function buildStartsHelper(binary: string): boolean {
  const { size, mtimeMs } = statSync(binary)
  const key = `${binary}\u0000${size}\u0000${mtimeMs}`
  const known = buildsStartingHelper.get(key)
  if (known !== undefined) {
    return known
  }
  const name = Buffer.from(CODEX_COMMAND_HELPER)
  const chunk = Buffer.alloc(SCAN_CHUNK_BYTES + name.length)
  const fd = openSync(binary, 'r')
  let found = false
  try {
    let carried = 0
    for (let position = 0; !found;) {
      const read = readSync(fd, chunk, carried, SCAN_CHUNK_BYTES, position)
      if (read === 0) {
        break
      }
      const filled = carried + read
      found = chunk.subarray(0, filled).includes(name)
      // Carry the tail so a name split across two reads is still seen.
      carried = Math.min(name.length - 1, filled)
      chunk.copy(chunk, 0, filled - carried, filled)
      position += read
    }
  } finally {
    closeSync(fd)
  }
  buildsStartingHelper.set(key, found)
  return found
}

/** True for a Codex that would start without the helper its build runs commands through, so no
 *  command could run. A launcher script finds its own package, and an unreadable file is left alone. */
export function codexCommandLacksHelper(
  command: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  try {
    const binary = realpathSync(command)
    if (!isNativeExecutable(binary)) {
      return false
    }
    const helper = helperFileName(platform)
    if (existsSync(join(dirname(binary), helper))) {
      return false
    }
    // The packaged layout keeps the binary apart from bin/, where the helper sits.
    for (let folder = dirname(binary), depth = 0; depth < 4; folder = dirname(folder), depth += 1) {
      if (existsSync(join(folder, PACKAGE_FILE))) {
        return !existsSync(join(folder, 'bin', helper))
      }
    }
    return buildStartsHelper(binary)
  } catch {
    return false
  }
}

/** Where the Codex desktop app keeps a whole command-line Codex of its own. */
function appBundledCodexCommands(platform: NodeJS.Platform, homePath: string): string[] {
  if (platform !== 'darwin') {
    return []
  }
  const inApp = join('ChatGPT.app', 'Contents', 'Resources', 'codex-cli', 'bin', 'codex')
  return [join('/Applications', inApp), join(homePath, 'Applications', inApp)]
}

/** Why the Codex found first cannot run a chat: a bare name means none was found at all. */
export function codexCommandProblem(
  command: string,
  platform: NodeJS.Platform = process.platform
): 'missing' | 'lacksHelper' | null {
  if (!isAbsolute(command)) {
    return 'missing'
  }
  return codexCommandLacksHelper(command, platform) ? 'lacksHelper' : null
}

export type WholeCodexSearch = ResolveCommandOptions & {
  /** The `codex` of Markov's own installed release, when there is one. */
  managedCommand?: string | null
}

/** When `command` is missing or lacks its helper: Markov's own Codex, else the first whole Codex
 *  elsewhere on this computer (searched as `codex` itself is, then in the desktop app). Null keeps
 *  `command`. */
export function wholeCodexCommandInsteadOf(
  command: string,
  options: WholeCodexSearch = {}
): string | null {
  const platform = options.platform ?? process.platform
  if (!codexCommandProblem(command, platform)) {
    return null
  }
  if (options.managedCommand) {
    return options.managedCommand
  }
  const candidates = [
    ...resolveCliCommandCandidates('codex', options),
    ...appBundledCodexCommands(platform, options.homePath ?? homedir())
  ]
  return (
    candidates.find(
      (candidate) =>
        candidate !== command &&
        isRunnableCommand(platform, candidate) &&
        !codexCommandLacksHelper(candidate, platform)
    ) ?? null
  )
}
