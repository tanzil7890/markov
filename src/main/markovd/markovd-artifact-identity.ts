import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  MARKOVD_MOBILE_WEB_MANIFEST,
  MARKOVD_SERVER_TARGET_FILENAME,
  MARKOVD_VERSION,
  markovdArtifactFilenames,
  markovdMobileWebAssetFilenames
} from '../../shared/markovd-artifacts'
import { COMPAT_SERVER_TARGETS, SERVER_TARGETS } from '../../shared/node-runtime-pin'
import { markovdAgentBrowserNativeName } from '../../shared/markovd-agent-browser-name'

/** Hash installed bytes in the build's order; a version marker is not proof of delivery. */
export async function readMarkovdArtifactIdentity(directory: string): Promise<string> {
  const hash = createHash('sha256')
  for (const filename of await listMarkovdArtifactFilenames(directory)) {
    for await (const chunk of createReadStream(join(directory, filename))) {
      hash.update(chunk)
    }
  }
  return `${MARKOVD_VERSION}+${hash.digest('hex').slice(0, 12)}`
}

/** The installed files the artifact identity covers, in the build's order. */
export async function listMarkovdArtifactFilenames(directory: string): Promise<string[]> {
  const target = z
    .enum([...SERVER_TARGETS, ...COMPAT_SERVER_TARGETS])
    .parse((await readFile(join(directory, MARKOVD_SERVER_TARGET_FILENAME), 'utf8')).trim())
  const platform = target.startsWith('win32-')
    ? 'win32'
    : target.startsWith('darwin-')
      ? 'darwin'
      : 'linux'
  const browser = markovdAgentBrowserNativeName(
    platform,
    target.split('-')[1] ?? '',
    target.endsWith('-musl') ? 'musl' : 'glibc'
  )
  const filenames = markovdArtifactFilenames(
    target,
    markovdMobileWebAssetFilenames(
      await readFile(join(directory, MARKOVD_MOBILE_WEB_MANIFEST), 'utf8')
    )
  )
  if (existsSync(join(directory, browser))) {
    filenames.push(browser)
  }
  return filenames
}
