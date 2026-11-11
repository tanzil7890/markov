import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { markovdRipgrepArtifact } from '../../../shared/markovd-artifacts'
import {
  listRemoteInstallBaseDirsCommand,
  probeRemoteInstallCompleteCommand
} from '../../ssh/ssh-remote-commands'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'

import {
  inventoryRemoteInstallDirs,
  MARKOVD_INSTALL_MODEL,
  RELAY_INSTALL_MODEL,
  remoteInstallDirOwner,
  remoteInstallGcPermits,
  remoteInstallVersionDirRegex
} from './remote-install-model'

const RELAY_DIRS = ['relay-0.1.0+abcdef123456', 'relay-v0.1.0', 'relay-1.2.3']
const MARKOVD_DIRS = ['markovd-0.1.0+abcdef123456', 'markovd-v0.1.0', 'markovd-1.2.3']

describe('remote install namespace', () => {
  it.skipIf(process.platform === 'win32')('rejects an install missing its search binary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'markovd-remote-probe-'))
    try {
      const host = getRemoteHostPlatform('linux-x64')
      const required = [...MARKOVD_INSTALL_MODEL.requiredArtifacts(host), '.install-complete']
      for (const filename of required) {
        const path = join(dir, filename)
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, '')
      }
      const command = probeRemoteInstallCompleteCommand(host, dir, required)
      expect(execFileSync('sh', ['-c', command], { encoding: 'utf8' }).trim()).toBe('OK')
      rmSync(join(dir, markovdRipgrepArtifact('linux-x64')))
      expect(execFileSync('sh', ['-c', command], { encoding: 'utf8' }).trim()).toBe('MISSING')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a dir prefix that could escape a remote glob or quote', () => {
    const injected = { ...RELAY_INSTALL_MODEL, dirPrefix: "relay'; rm -rf ~" }
    expect(() => remoteInstallVersionDirRegex(injected)).toThrow('Unsafe remote install dir prefix')
  })
})

describe('GC ownership — each model collects only its own namespace', () => {
  it.each(MARKOVD_DIRS)('the relay never permits GC of %s', (dirName) => {
    expect(remoteInstallDirOwner(dirName)).toBe('markovd')
    expect(remoteInstallGcPermits(RELAY_INSTALL_MODEL, dirName)).toBe(false)
  })

  it.each(RELAY_DIRS)('markovd never permits GC of %s', (dirName) => {
    expect(remoteInstallDirOwner(dirName)).toBe('relay')
    expect(remoteInstallGcPermits(MARKOVD_INSTALL_MODEL, dirName)).toBe(false)
  })

  it('permits each model its own dirs and its own tombstones', () => {
    expect(remoteInstallGcPermits(RELAY_INSTALL_MODEL, 'relay-0.1.0+aa')).toBe(true)
    expect(remoteInstallGcPermits(MARKOVD_INSTALL_MODEL, 'markovd-0.1.0+aa')).toBe(true)
    expect(
      remoteInstallGcPermits(MARKOVD_INSTALL_MODEL, 'markovd-0.1.0+aa.gc-tombstone.12.34')
    ).toBe(true)
  })

  it('claims nothing it did not create', () => {
    for (const name of [
      '.markov-remote',
      'markovd',
      'relayish-0.1.0',
      'markovd-notaversion',
      'node'
    ]) {
      expect(remoteInstallDirOwner(name)).toBeNull()
      expect(remoteInstallGcPermits(RELAY_INSTALL_MODEL, name)).toBe(false)
      expect(remoteInstallGcPermits(MARKOVD_INSTALL_MODEL, name)).toBe(false)
    }
  })

  it('gives the shared runtime store its own owner that no version-dir GC may take', () => {
    expect(remoteInstallDirOwner('runtimes')).toBe('runtimes')
    expect(remoteInstallGcPermits(RELAY_INSTALL_MODEL, 'runtimes')).toBe(false)
    expect(remoteInstallGcPermits(MARKOVD_INSTALL_MODEL, 'runtimes')).toBe(false)
    expect(inventoryRemoteInstallDirs(['runtimes', ...RELAY_DIRS]).runtimes).toEqual(['runtimes'])
  })

  it.skipIf(process.platform === 'win32')(
    'keeps runtimes/ out of every model listing, including older clients’ prefix scans',
    () => {
      const base = mkdtempSync(join(tmpdir(), 'install-listing-'))
      try {
        for (const name of ['runtimes', 'relay-0.1.0+aa', 'markovd-0.1.0+aa']) {
          mkdirSync(join(base, name))
        }
        mkdirSync(join(base, 'runtimes', `node-${'a'.repeat(64)}`))
        const host = getRemoteHostPlatform('linux-x64')
        for (const model of [RELAY_INSTALL_MODEL, MARKOVD_INSTALL_MODEL]) {
          const listed = execFileSync(
            '/bin/sh',
            ['-c', listRemoteInstallBaseDirsCommand(host, base, model)],
            { encoding: 'utf8' }
          )
          expect(listed.trim().split('\n')).toEqual([`${model.dirPrefix}-0.1.0+aa`])
        }
      } finally {
        rmSync(base, { recursive: true, force: true })
      }
    }
  )
})
