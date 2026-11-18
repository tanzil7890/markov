// Unpack a downloaded release whose checksum was already verified: a zip gives up exactly its pinned
// members; a tar.gz is unpacked by the system tar, whole when the release needs its other files.

import { runProcess } from '@markov/process-host'
import { isDefinitiveAbsence } from '../../shared/definitive-filesystem-absence'
import type { ManagedRuntimePin } from './managed-runtime-release'
import { extractPinnedZipMembers } from './pinned-zip-members'

const TAR_TIMEOUT_MS = 10 * 60_000

export async function extractPinnedArchiveMembers(
  archivePath: string,
  directory: string,
  pin: Pick<ManagedRuntimePin, 'members' | 'extractWholeArchive'>,
  label: string,
  signal: AbortSignal
): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    await extractPinnedZipMembers(archivePath, directory, pin.members, label, signal)
    return
  }
  const named = pin.extractWholeArchive ? [] : pin.members.map((member) => member.path)
  const result = await runProcess({
    program: 'tar',
    args: ['-xzf', archivePath, '-C', directory, ...named],
    timeoutMs: TAR_TIMEOUT_MS,
    signal
  }).catch((error: unknown) => {
    if (isDefinitiveAbsence(error)) {
      throw new Error(`The ${label} archive could not be unpacked: tar is not installed.`, {
        cause: error
      })
    }
    throw error
  })
  signal.throwIfAborted()
  if (result.code !== 0) {
    throw new Error(
      `The ${label} archive could not be unpacked: ${(result.stderr || result.stdout).trim().slice(0, 400)}`
    )
  }
}
