import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ExecCommandModule from '../../ssh/remote-exec/remote-exec-command'
import type * as RecordFile from './markovd-remote-record-file'
import type * as InstallLock from './remote-install-lock'

vi.mock('../../ssh/remote-exec/remote-exec-command', async (importOriginal) => ({
  ...(await importOriginal<typeof ExecCommandModule>()),
  execCommand: vi.fn()
}))
vi.mock('../../../shared/shell/launch/shell-argument-quoting', () => ({
  quotePosixShell: (s: string) => `'${s}'`
}))
vi.mock('./remote-install-lock', async (importOriginal) => ({
  ...(await importOriginal<typeof InstallLock>()),
  acquireInstallLock: vi.fn()
}))
vi.mock('./markovd-remote-record-file', async (importOriginal) => ({
  ...(await importOriginal<typeof RecordFile>()),
  writeAtomicMarkovdRemoteRecord: vi.fn()
}))

import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { acquireInstallLock } from './remote-install-lock'
import { writeAtomicMarkovdRemoteRecord } from './markovd-remote-record-file'
import { decommissionRemoteMarkovd } from './markovd-remote-decommission'
import { recoverInterruptedMarkovdActivation } from '../activation/markovd-activation-recovery'
import { parseMarkovdActivationRecord } from '../activation/markovd-activation-record'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import type { MarkovdTerminalCensus } from '../../../shared/markovd-terminal-census'
import {
  FakeMarkovdHost,
  OLD,
  type CrashMode
} from '../activation/markovd-activation-host-test-harness'

let host = new FakeMarkovdHost()

const slot = {
  conn: Object.create(null),
  host: getRemoteHostPlatform('linux-x64'),
  remoteHome: '/home/u',
  nodePath: '/usr/bin/node',
  userDataDir: '/home/u/.markov',
  bindHost: '127.0.0.1',
  port: 7777,
  readinessTimeoutMs: 50,
  sleep: async () => {},
  now: () => new Date('2026-02-02T00:00:00.000Z')
}
const idle: MarkovdTerminalCensus = {
  liveSessions: 0,
  startedSinceActivation: 0,
  daemonProtocolVersion: 3
}

function currentRecord() {
  const parsed = parseMarkovdActivationRecord(host.record)
  if (parsed.state !== 'ok') {
    throw new Error('fixture record is unreadable')
  }
  return parsed.record
}

const decommission = (census: MarkovdTerminalCensus = idle) =>
  decommissionRemoteMarkovd({ ...slot, record: currentRecord(), census })

beforeEach(() => {
  vi.clearAllMocks()
  host = FakeMarkovdHost.deployedOld()
  vi.mocked(execCommand).mockImplementation(async (_conn, command) => host.exec(command))
  vi.mocked(acquireInstallLock).mockImplementation(async (_conn, _root, _host, options) => {
    host.acquireFence(options)
  })
  vi.mocked(writeAtomicMarkovdRemoteRecord).mockImplementation(async (_target, path, contents) =>
    host.write(path, contents)
  )
})

function expectExactlyTheRecordedSlot(): void {
  const active = host.activeVersion()
  expect([...host.alive]).toEqual(active ? [active] : [])
  expect(host.journal).toBeNull()
  expect(host.fence).toBe(false)
}

describe('decommissioning a managed markovd', () => {
  it.each([
    [{ ...idle, liveSessions: null }, 'unverifiable', 'markovd_decommission_census_unavailable'],
    [{ ...idle, liveSessions: 2 }, 'live', 'markovd_decommission_terminals_running']
  ] as const)('refuses while the census says %j', async (census, verdict, code) => {
    expect(await decommission(census)).toMatchObject({ outcome: 'refused', verdict, code })
    expect(host.alive.has(OLD)).toBe(true)
    expect(writeAtomicMarkovdRemoteRecord).not.toHaveBeenCalled()
  })

  it('keeps the fence while markovd is still stopping, and recovery finishes once it exits', async () => {
    host.managedStop = 'stays-dispatched'
    expect(await decommission()).toMatchObject({
      outcome: 'refused',
      verdict: 'live',
      code: 'markovd_decommission_stop_unsettled'
    })
    expect(host.fence).toBe(true)
    expect(host.journal).not.toBeNull()
    expect(await recoverInterruptedMarkovdActivation(slot)).toMatchObject({
      outcome: 'refused',
      code: 'markovd_recovery_decommission_unsettled'
    })
    host.managedStop = 'exits'
    expect(await recoverInterruptedMarkovdActivation(slot)).toMatchObject({
      outcome: 'recovered',
      resolution: 'committed',
      activeVersion: null
    })
    expectExactlyTheRecordedSlot()
  })

  it.each<CrashMode>(['before', 'after'])(
    'recovers to exactly the recorded slot when interrupted at every mutation (%s)',
    async (mode) => {
      host = FakeMarkovdHost.deployedOld()
      await decommission()
      const total = host.mutations
      expect(total).toBeGreaterThan(3)
      for (let crashAt = 1; crashAt <= total; crashAt += 1) {
        host = FakeMarkovdHost.deployedOld()
        host.crashAt = crashAt
        host.crashMode = mode
        await decommission().catch(() => undefined)
        host.crashAt = null
        const result = await recoverInterruptedMarkovdActivation(slot)
        expect(['recovered', 'none'], `mutation ${crashAt}`).toContain(result.outcome)
        expectExactlyTheRecordedSlot()
      }
    }
  )
})
