import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  installMarkovdFeatureReadiness,
  MARKOVD_FEATURES,
  rpcMethodFeatureWait
} from './markovd-feature-readiness'

// No local readiness reset: the shared vitest setup must restore it (asserted below).
afterEach(() => {
  vi.useRealTimers()
})

describe('MarkovdFeatureReadiness', () => {
  it('adds no await for open or undeclared features, so ungated dispatch starts synchronously', () => {
    expect(rpcMethodFeatureWait([])).toBeNull()
    expect(rpcMethodFeatureWait(['accounts'])).toBeNull()
    const readiness = installMarkovdFeatureReadiness()
    expect(rpcMethodFeatureWait([])).toBeNull()
    readiness.open('accounts')
    expect(rpcMethodFeatureWait(['accounts'])).toBeNull()
  })

  it('starts with every feature closed under markovd and waits for all a method names', async () => {
    const readiness = installMarkovdFeatureReadiness()
    expect(MARKOVD_FEATURES.every((feature) => !readiness.isOpen(feature))).toBe(true)
    let settled = false
    const wait = rpcMethodFeatureWait(['accounts', 'orchestration'])?.then(() => {
      settled = true
    })
    readiness.open('accounts')
    await Promise.resolve()
    expect(settled).toBe(false)
    readiness.open('orchestration')
    await wait
    expect(settled).toBe(true)
  })

  it('refuses with runtime_unavailable after the bound and leaves no timer behind', async () => {
    vi.useFakeTimers()
    installMarkovdFeatureReadiness()
    const wait = rpcMethodFeatureWait(['sessionSearch'], [], 50)
    const refused = expect(wait).rejects.toThrow('runtime_unavailable')
    await vi.advanceTimersByTimeAsync(50)
    await refused
    expect(vi.getTimerCount()).toBe(0)
  })

  // The shared setup resets after every test; these two run in order in one worker.
  it('may leave latches closed when a test stops partway', () => {
    installMarkovdFeatureReadiness()
    expect(rpcMethodFeatureWait(['accounts'])).not.toBeNull()
  })

  it('finds every latch open again in the next test', () => {
    expect(rpcMethodFeatureWait(['accounts'])).toBeNull()
  })
})
