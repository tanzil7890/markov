import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARKOVD_VERSION,
  markovdArtifactFilenames
} from '../../../../src/shared/markovd-artifacts.ts'
import { readMarkovdMobileWebAssetFilenames } from './markovd-mobile-web-bundle.mjs'

/** The runtime enters through `.runtime-node`'s executableSha256 string, never its bytes (design D2). */
export function computeMarkovdFullVersion(artifactDir, { target, agentBrowserFilename }) {
  const hash = createHash('sha256')
  for (const filename of markovdArtifactFilenames(
    target,
    readMarkovdMobileWebAssetFilenames(artifactDir)
  )) {
    const artifactPath = join(artifactDir, filename)
    if (!existsSync(artifactPath)) {
      throw new Error(
        `markovd declares ${filename} in MARKOVD_ARTIFACTS but never emitted it. Add the build ` +
          'step, or drop it from src/shared/markovd-artifacts.ts.'
      )
    }
    hash.update(readFileSync(artifactPath))
  }
  if (agentBrowserFilename && existsSync(join(artifactDir, agentBrowserFilename))) {
    hash.update(readFileSync(join(artifactDir, agentBrowserFilename)))
  }
  return `${MARKOVD_VERSION}+${hash.digest('hex').slice(0, 12)}`
}
