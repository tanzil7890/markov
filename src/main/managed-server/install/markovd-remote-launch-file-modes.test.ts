import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runProcess } from '@markov/process-host'
import { MARKOVD_LOG_FILENAME, MARKOVD_READINESS_FILENAME } from './markovd-remote-host-support'
import { markovdLaunchCommand } from './markovd-remote-launch'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'

// Pairing tokens in readiness require owner-only launch artifacts even under login umask 022.

const posix = getRemoteHostPlatform('linux-x64')
const READY_LINE = '{"type":"markov_server_ready","pairing":{"url":"markov://pair#token"}}'

let home: string
let baseDir: string
let slotDir: string

function writeEntry(dir: string, before = ''): void {
  writeFileSync(join(dir, 'markovd.js'), `${before}console.log(${JSON.stringify(READY_LINE)})\n`)
}

describe.skipIf(process.platform === 'win32')('markovd launch file modes', () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'markovd-launch-modes-'))
    baseDir = join(home, '.markov-remote')
    slotDir = join(baseDir, 'markovd-0.2.0+bb01')
    mkdirSync(slotDir, { recursive: true, mode: 0o755 })
    chmodSync(baseDir, 0o755)
    chmodSync(slotDir, 0o755)
    writeEntry(slotDir)
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  // Daemon children create user files and must retain login umask (#31125).

  // Artifact paths are relative to the slot, so a failed cd must not launch from the login cwd.
  it('creates nothing in the login directory when the slot is missing', async () => {
    rmSync(slotDir, { recursive: true, force: true })
    const command = markovdLaunchCommand(posix, {
      remoteInstallDir: slotDir,
      nodePath: process.execPath,
      fullVersion: '0.2.0+bb01',
      userDataDir: join(home, '.markov'),
      bindHost: '127.0.0.1',
      port: 7777,
      activationRoot: join(baseDir, '.markovd-activation-transaction')
    })

    const result = await runProcess({
      program: '/bin/sh',
      args: ['-c', `cd ${quotePosixShell(home)}; ${command}`],
      timeoutMs: 10_000
    })

    expect(result.code).not.toBe(0)
    expect(existsSync(join(home, MARKOVD_READINESS_FILENAME))).toBe(false)
    expect(existsSync(join(home, MARKOVD_LOG_FILENAME))).toBe(false)
  })
})
