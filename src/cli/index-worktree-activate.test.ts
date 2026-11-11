import { describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveMarkovAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveMarkovAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/markov-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveMarkovAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('./runtime/environments', () => ({
  addEnvironmentFromPairingCode: addEnvironmentFromPairingCodeMock,
  removeEnvironment: vi.fn(),
  resolveEnvironment: vi.fn()
}))

vi.mock('../shared/remote-runtime/host-store/runtime-environment-store', () => ({
  listEnvironments: listEnvironmentsMock
}))

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from './index'
import { okFixture, queueFixtures } from './test-fixtures'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'

describe('markov worktree activate', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveMarkovAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })

  // #36923: opening a workspace from the CLI is what wakes a sleeping recipe VM behind it.
  it('opens a worktree on its host for `worktree activate`', async () => {
    queueFixtures(callMock, okFixture('req_1', { worktreeId: 'repo::/tmp/repo/feature' }))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['worktree', 'activate', '--worktree', 'id:repo::/tmp/repo/feature'], '/tmp')

    expect(callMock).toHaveBeenCalledExactlyOnceWith('worktree.activate', {
      worktree: 'id:repo::/tmp/repo/feature',
      navigation: 'host'
    })
    expect(logSpy).toHaveBeenCalledExactlyOnceWith('Activated repo::/tmp/repo/feature')
  })
})
