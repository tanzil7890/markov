import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, copyFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileSha256 } from '../node-runtime/pinned-runtime-materializer'

/** Gives the host's own Codex its command helper when that copy is byte for byte the release
 *  Markov installed, so the same `codex` also works in a terminal. Any other build is left alone:
 *  a helper from a different release would not be its companion. Returns whether it was placed. */
export async function repairOwnCodexHelper(input: {
  ownCommand: string
  /** Markov's installed release: its `codex`, the checksum that proves the build, and its helper. */
  managed: { codexSha256: string; codexBytes: number; helper: string }
}): Promise<boolean> {
  const { managed } = input
  const own = await realpath(input.ownCommand)
  const target = join(dirname(own), basename(managed.helper))
  if (existsSync(target) || (await stat(own)).size !== managed.codexBytes) {
    return false
  }
  if ((await fileSha256(own)) !== managed.codexSha256) {
    return false
  }
  // Stage beside the target so the helper is never seen half-written.
  const staged = join(dirname(own), `.${basename(managed.helper)}-${randomUUID()}.tmp`)
  try {
    await copyFile(managed.helper, staged)
    await chmod(staged, 0o755)
    await rename(staged, target)
    return true
  } catch (error) {
    await rm(staged, { force: true })
    throw error
  }
}
