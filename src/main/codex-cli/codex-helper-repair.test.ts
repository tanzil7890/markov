import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { repairOwnCodexHelper } from './codex-helper-repair'

const roots: string[] = []

function installs(ownBuild: string): {
  own: string
  managed: Parameters<typeof repairOwnCodexHelper>[0]['managed']
} {
  const root = mkdtempSync(join(tmpdir(), 'codex-helper-repair-'))
  roots.push(root)
  mkdirSync(join(root, 'own'))
  mkdirSync(join(root, 'markov', 'bin'), { recursive: true })
  const own = join(root, 'own', 'codex')
  writeFileSync(own, ownBuild)
  const helper = join(root, 'markov', 'bin', 'codex-code-mode-host')
  writeFileSync(helper, 'pinned helper')
  const pinnedBuild = 'pinned codex build'
  return {
    own,
    managed: {
      codexSha256: createHash('sha256').update(pinnedBuild).digest('hex'),
      codexBytes: Buffer.byteLength(pinnedBuild),
      helper
    }
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('giving the host’s own Codex its helper', () => {
  it('places Markov’s helper beside a copy that is the very build Markov installed', async () => {
    const { own, managed } = installs('pinned codex build')

    expect(await repairOwnCodexHelper({ ownCommand: own, managed })).toBe(true)
    expect(readFileSync(join(own, '..', 'codex-code-mode-host'), 'utf8')).toBe('pinned helper')
  })

  it('leaves any other build alone, even one of the same size', async () => {
    const { own, managed } = installs('pinned codex buile')

    expect(await repairOwnCodexHelper({ ownCommand: own, managed })).toBe(false)
    expect(existsSync(join(own, '..', 'codex-code-mode-host'))).toBe(false)
  })
})
