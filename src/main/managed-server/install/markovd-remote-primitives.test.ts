import type * as ExecCommandModule from '../../ssh/remote-exec/remote-exec-command'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../ssh/remote-exec/remote-exec-command', async (importOriginal) => ({
  ...(await importOriginal<typeof ExecCommandModule>()),
  execCommand: vi.fn(),
  isUnconfirmedSshCommandTermination: (error: unknown) =>
    error instanceof Error && error.message === 'channel lost'
}))

vi.mock('../../ssh/ssh-remote-platform-detection', () => ({ detectRemoteHostPlatform: vi.fn() }))
vi.mock('../host-state/markovd-windows-host-preparation', () => ({
  prepareWindowsMarkovdHost: vi.fn()
}))

import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import { parseMarkovdReadinessOutput } from './markovd-remote-launch'

const mockExec = vi.mocked(execCommand)
getRemoteHostPlatform('linux-x64')
getRemoteHostPlatform('win32-x64')
Object.create(null)

beforeEach(() => {
  mockExec.mockReset()
})

describe('readiness parsing bounds', () => {
  it('waits on a half-written last line but rejects a finished invalid one', () => {
    expect(parseMarkovdReadinessOutput('{"type":"markov_ser')).toEqual({ state: 'pending' })
    expect(parseMarkovdReadinessOutput('{"type":"markov_ser\n')).toMatchObject({
      state: 'malformed'
    })
  })
})
