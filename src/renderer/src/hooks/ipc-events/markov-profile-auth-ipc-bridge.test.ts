import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkovCloudSignInProgress } from '../../../../shared/markov-profiles'
import { createTestStore } from '../../store/slices/store-test-helpers'

type TestStore = ReturnType<typeof createTestStore>

const { storeHolder } = vi.hoisted((): { storeHolder: { current: TestStore | null } } => ({
  storeHolder: { current: null }
}))

vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => storeHolder.current?.getState(),
    setState: (partial: { markovProfileSignInProgress: MarkovCloudSignInProgress | null }) =>
      storeHolder.current?.setState(partial)
  }
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }
}))

import { registerMarkovProfileAuthIpcBridge } from './markov-profile-auth-ipc-bridge'

describe('markov profile sign-in progress IPC bridge', () => {
  let emitProgress: (progress: MarkovCloudSignInProgress | null) => void
  const snapshots: ((progress: MarkovCloudSignInProgress | null) => void)[] = []
  const WAITING = { link: 'https://login.example/authorize?state=a' }

  beforeEach(() => {
    snapshots.length = 0
    storeHolder.current = createTestStore()
    vi.stubGlobal('window', {
      api: {
        markovProfiles: {
          onSignInProgressChanged: (
            callback: (progress: MarkovCloudSignInProgress | null) => void
          ) => {
            emitProgress = callback
            return () => {}
          },
          signInProgress: () =>
            new Promise<MarkovCloudSignInProgress | null>((resolve) => {
              snapshots.push(resolve)
            })
        }
      }
    })
  })

  const progress = (): MarkovCloudSignInProgress | null =>
    storeHolder.current?.getState().markovProfileSignInProgress ?? null

  it('lets a newer change win over a late snapshot', async () => {
    registerMarkovProfileAuthIpcBridge([])
    await vi.waitFor(() => expect(snapshots).toHaveLength(1))
    emitProgress(null)
    snapshots[0](WAITING)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(progress()).toBeNull()
  })
})
