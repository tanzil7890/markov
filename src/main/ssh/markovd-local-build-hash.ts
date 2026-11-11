import { join } from 'node:path'
import { hashMarkovdLauncher } from '../../shared/markovd-build-identity'
import { MARKOVD_LAUNCHER_FILENAME } from '../../shared/markovd-artifacts'

export function computeLocalMarkovdBuildHash(localMarkovdDir: string): string {
  return hashMarkovdLauncher(join(localMarkovdDir, MARKOVD_LAUNCHER_FILENAME))
}
