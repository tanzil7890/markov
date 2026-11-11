import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ExecCommandModule from '../../ssh/remote-exec/remote-exec-command'
import { runProcess } from '@markov/process-host'

vi.mock('../../ssh/remote-exec/remote-exec-command', async (importOriginal) => ({
  ...(await importOriginal<typeof ExecCommandModule>()),
  execCommand: vi.fn()
}))

import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import {
  emptyMarkovdActivationRecord,
  serializeMarkovdActivationRecord,
  withActivatedVersion
} from '../../managed-server/activation/markovd-activation-record'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import {
  createWslMarkovdConnectStateReader,
  parseWslMarkovdConnectState,
  wslMarkovdConnectStateHints
} from './wsl-markovd-connect-state-snapshot'

const mockExec = vi.mocked(execCommand)
const host = getRemoteHostPlatform('linux-x64')
const ACTIVE = withActivatedVersion(
  emptyMarkovdActivationRecord(),
  '0.1.0+aa01',
  null,
  new Date('2026-02-02T00:00:00.000Z')
)
let home: string

function target() {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: execCommand is mocked, so the transport is never used.
  const conn = Object.create(null) as MarkovdHostTransport
  return { conn, host, remoteHome: home, userDataDir: join(home, '.markov') }
}

function write(relative: string, content: string): void {
  const path = join(home, relative)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'markov-wsl-connect-state-'))
  mockExec.mockReset()
  mockExec.mockImplementation(async (_conn, command) => {
    const result = await runProcess({ program: '/bin/sh', args: ['-c', command] })
    if (result.code !== 0) {
      throw new Error(result.stderr)
    }
    return result.stdout
  })
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32')('WSL connect state snapshot fallbacks', () => {
  it('falls back to the plain read when the snapshot command itself fails', async () => {
    write('.markov-remote/markovd-active.json', serializeMarkovdActivationRecord(ACTIVE))
    mockExec.mockImplementationOnce(async () => {
      throw new Error('transport closed')
    })
    const reader = createWslMarkovdConnectStateReader()

    await expect(reader.readActivationRecord(target())).resolves.toEqual(ACTIVE)
    expect(reader.snapshot()).toBeNull()
  })

  it('gives no hints when only the fallback read could answer the record', async () => {
    write('.markov-remote/markovd-active.json', serializeMarkovdActivationRecord(ACTIVE))
    mockExec.mockImplementationOnce(
      async () =>
        'UNREADABLE\n__MARKOV_WSL_CONNECT_STATE_END__\nABSENT\n__MARKOV_WSL_CONNECT_STATE_END__\n' +
        'ABSENT\n__MARKOV_WSL_CONNECT_STATE_END__\nNONE\n__MARKOV_WSL_CONNECT_STATE_END__\nOPEN\n'
    )
    const reader = createWslMarkovdConnectStateReader()

    await expect(reader.readActivationRecord(target())).resolves.toEqual(ACTIVE)
    expect(reader.snapshot()).toBeNull()
  })
})

describe('parseWslMarkovdConnectState', () => {
  const end = '\n__MARKOV_WSL_CONNECT_STATE_END__\n'
  const stat = (pid: number) =>
    `${pid} (node) S ${Array.from({ length: 18 }, () => '0').join(' ')} 77 0`
  const identity = (pid: number) =>
    `PID ${pid}\n0f6e1d2c-3b4a-4958-8776-655443322110\n--markov-identity--\n${stat(1)}\n` +
    `--markov-identity--\n${stat(pid)}\n--markov-identity--\n`
  const answer = (holder: string) =>
    `ABSENT${end}ABSENT${end}PRESENT\n{"pid":9}${end}${holder}${end}OPEN\n`

  it('attaches the holder identity to a present lock, and nothing it cannot parse', () => {
    const lock = parseWslMarkovdConnectState(answer(identity(9)))?.instanceLock
    expect(lock).toMatchObject({ state: 'present', holder: { pid: 9, guest: { markovd: '9:77' } } })
    expect(parseWslMarkovdConnectState(answer('NONE'))?.instanceLock).toEqual({
      state: 'present',
      raw: '{"pid":9}'
    })
    expect(parseWslMarkovdConnectState(answer('PID 9\nnoise'))?.instanceLock).not.toHaveProperty(
      'holder'
    )
  })

  it('rejects a truncated answer', () => {
    expect(parseWslMarkovdConnectState('ABSENT\n__MARKOV_WSL_CONNECT_STATE_END__\n')).toBeNull()
  })
})

describe('wslMarkovdConnectStateHints', () => {
  const snapshot = {
    activation: { state: 'ok' as const, record: ACTIVE },
    transactionAbsent: true,
    instanceLock: { state: 'absent' as const },
    fenceOpen: true
  }

  it('stops hinting once recovery, adoption or admission replaced the record', () => {
    const hints = wslMarkovdConnectStateHints(snapshot, ACTIVE)
    const replaced = { ...ACTIVE }
    expect(hints.instanceLock(replaced)).toBeUndefined()
    expect(hints.deployPreRead(replaced)).toEqual({})
  })
})
