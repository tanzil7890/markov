import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { MARKOVD_LAUNCHER_FILENAME, MARKOVD_SERVER_ENTRY_FILENAME } from './markovd-artifacts'

export const MARKOVD_BUILD_HASH_LENGTH = 16

/** The launcher embeds its server digest, keeping the hash older clients calculate. */
export function hashMarkovdLauncher(entryPath: string): string {
  const entry = realpathSync(entryPath)
  const launcher =
    basename(entry) === MARKOVD_SERVER_ENTRY_FILENAME
      ? join(dirname(entry), MARKOVD_LAUNCHER_FILENAME)
      : entry
  return createHash('sha256')
    .update(readFileSync(launcher))
    .digest('hex')
    .slice(0, MARKOVD_BUILD_HASH_LENGTH)
}
