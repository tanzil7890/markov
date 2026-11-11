import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stampMarkovdAppVersion } from './markovd-host-adapters'

describe('the Markov version a server reports', () => {
  let root: string
  let saved: string | undefined

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'markovd-app-version-'))
    saved = process.env.MARKOV_APP_VERSION
    delete process.env.MARKOV_APP_VERSION
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    if (saved === undefined) {
      delete process.env.MARKOV_APP_VERSION
    } else {
      process.env.MARKOV_APP_VERSION = saved
    }
  })

  it('replaces a version inherited from the Markov that started it', () => {
    process.env.MARKOV_APP_VERSION = '1.4.300'
    mkdirSync(join(root, 'out'), { recursive: true })
    writeFileSync(join(root, 'out', 'package.json'), JSON.stringify({ version: '1.4.224' }))
    stampMarkovdAppVersion(() => root)
    expect(process.env.MARKOV_APP_VERSION).toBe('1.4.224')
  })

  it('leaves the environment alone when the bundle has no version', () => {
    stampMarkovdAppVersion(() => root)
    expect(process.env.MARKOV_APP_VERSION).toBeUndefined()
    stampMarkovdAppVersion(() => {
      throw new Error('markovd_install_root_unavailable')
    })
    expect(process.env.MARKOV_APP_VERSION).toBeUndefined()
  })
})
