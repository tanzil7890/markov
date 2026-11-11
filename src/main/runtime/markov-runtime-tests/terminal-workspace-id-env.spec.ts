import { describe, expect, it, vi } from 'vitest'
import './runtime-test-module-registration.spec'
import { MarkovRuntimeService } from '../markov-runtime'
import { TEST_WORKTREE_ID, store } from './markov-runtime-test-fixtures.spec'
import { spawnedPtyEnv } from '../spawned-pty-env-fixtures'

function makeRuntime(): { runtime: MarkovRuntimeService; spawn: ReturnType<typeof vi.fn> } {
  const spawn = vi.fn().mockResolvedValue({ id: 'pty-workspace-id' })
  const runtime = new MarkovRuntimeService(store)
  runtime.setPtyController({
    spawn,
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  return { runtime, spawn }
}

// Host-created panes need the same workspace id that renderer panes pass to agent wrappers.
describe('MarkovRuntimeService terminal MARKOV_WORKSPACE_ID', () => {
  it('replaces a client-sent value with the host workspace id', async () => {
    const { runtime, spawn } = makeRuntime()

    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, {
      env: { MARKOV_WORKSPACE_ID: 'stale-client-id' }
    })

    expect(spawnedPtyEnv(spawn.mock.calls[0]?.[0]).MARKOV_WORKSPACE_ID).toBe(TEST_WORKTREE_ID)
  })
})
