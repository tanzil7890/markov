import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { codexCommandLacksHelper, wholeCodexCommandInsteadOf } from './whole-codex-command'

const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46])
const roots: string[] = []

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'whole-codex-'))
  roots.push(root)
  return root
}

function program(path: string, content: Buffer | string): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  chmodSync(path, 0o755)
  return path
}

/** A compiled Codex; `startsHelper` builds name the helper they run commands through. */
function compiledCodex(path: string, startsHelper: boolean): string {
  const body = startsHelper ? 'failed to spawn code-mode host; install codex-code-mode-host' : ''
  return program(path, Buffer.concat([ELF, Buffer.alloc(64), Buffer.from(body)]))
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('a Codex without its command helper', () => {
  it('is only a compiled build that names the helper and has none installed with it', () => {
    const root = folder()
    const alone = compiledCodex(join(root, 'alone', 'codex'), true)
    const beside = compiledCodex(join(root, 'beside', 'codex'), true)
    program(join(root, 'beside', 'codex-code-mode-host'), ELF)
    const packaged = compiledCodex(join(root, 'pkg', 'App.app', 'Contents', 'MacOS', 'codex'), true)
    program(join(root, 'pkg', 'bin', 'codex-code-mode-host'), ELF)
    writeFileSync(join(root, 'pkg', 'codex-package.json'), '{}')
    const older = compiledCodex(join(root, 'older', 'codex'), false)
    const launcher = program(join(root, 'launcher', 'codex'), '#!/bin/sh\nexec real-codex "$@"\n')

    expect(
      [alone, beside, packaged, older, launcher].map((command) =>
        codexCommandLacksHelper(command, 'linux')
      )
    ).toEqual([true, false, false, false, false])
  })

  it('gives way to the next whole Codex on the search path, and to nothing when there is none', () => {
    const root = folder()
    const broken = compiledCodex(join(root, 'first', 'codex'), true)
    compiledCodex(join(root, 'second', 'codex'), true)
    const whole = compiledCodex(join(root, 'third', 'codex'), true)
    program(join(root, 'third', 'codex-code-mode-host'), ELF)
    const search = (...folders: string[]) => ({
      platform: 'linux' as const,
      homePath: join(root, 'home'),
      pathEnv: folders.map((name) => join(root, name)).join(':')
    })

    expect(wholeCodexCommandInsteadOf(broken, search('first', 'second', 'third'))).toBe(whole)
    expect(wholeCodexCommandInsteadOf(broken, search('first', 'second'))).toBeNull()
    expect(wholeCodexCommandInsteadOf(whole, search('first', 'third'))).toBeNull()
  })

  it('runs Markov’s own Codex before any other copy, and when none was found at all', () => {
    const root = folder()
    const broken = compiledCodex(join(root, 'first', 'codex'), true)
    compiledCodex(join(root, 'third', 'codex'), true)
    program(join(root, 'third', 'codex-code-mode-host'), ELF)
    const managed = join(root, 'markov', 'bin', 'codex')
    const search = {
      platform: 'linux' as const,
      homePath: join(root, 'home'),
      pathEnv: [join(root, 'first'), join(root, 'third')].join(':'),
      managedCommand: managed
    }

    expect(wholeCodexCommandInsteadOf(broken, search)).toBe(managed)
    expect(wholeCodexCommandInsteadOf('codex', { ...search, pathEnv: '' })).toBe(managed)
    expect(wholeCodexCommandInsteadOf(join(root, 'third', 'codex'), search)).toBeNull()
  })
})
