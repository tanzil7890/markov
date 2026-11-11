import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { MARKOVD_SERVER_ENTRY_FILENAME } from '../../shared/markovd-artifacts'
import { assertMarkovdServerRuntime, handoffToBundledMarkovd } from './markovd-bundled-runtime'
import { MARKOVD_EXIT_CONFIGURATION } from './markovd-configuration-exit'
import { enableManagedMarkovdCompileCache } from './markovd-compile-cache'

declare const MARKOVD_SERVER_SHA256: string

let loadServer: (() => void) | undefined

try {
  if (!handoffToBundledMarkovd()) {
    assertMarkovdServerRuntime()
    const entry = realpathSync(process.argv[1] ?? __filename)
    const server = join(dirname(entry), MARKOVD_SERVER_ENTRY_FILENAME)
    if (createHash('sha256').update(readFileSync(server)).digest('hex') !== MARKOVD_SERVER_SHA256) {
      throw new Error('The Markov server does not match its launcher')
    }
    loadServer = () => {
      enableManagedMarkovdCompileCache(dirname(entry))
      createRequire(entry)(server)
    }
  }
} catch (error) {
  console.error('markovd: failed to launch:', error)
  process.exit(MARKOVD_EXIT_CONFIGURATION)
}

loadServer?.()
