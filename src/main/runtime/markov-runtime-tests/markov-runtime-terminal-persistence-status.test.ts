import './runtime-test-module-registration.spec'
import './markov-runtime-test-lifecycle.spec'
import { describe, expect, it } from 'vitest'
import { MarkovRuntimeService } from '../markov-runtime'
import { store } from './markov-runtime-test-fixtures.spec'
import { TERMINAL_PERSISTENCE_UNAVAILABLE_CODE } from '../../../shared/runtime-capability-degradation'

describe('runtime status terminal persistence', () => {
  it('reports when new terminals would not survive a server restart', () => {
    let daemonOwnsFreshSessions = false
    const runtime = new MarkovRuntimeService(store, undefined, {
      canRecoverPersistentLocalPtys: () => daemonOwnsFreshSessions
    })
    const codes = (): string[] =>
      (runtime.getStatus().degradations ?? []).map((degradation) => degradation.code)

    expect(codes()).toContain(TERMINAL_PERSISTENCE_UNAVAILABLE_CODE)
    daemonOwnsFreshSessions = true
    expect(codes()).not.toContain(TERMINAL_PERSISTENCE_UNAVAILABLE_CODE)
  })
})
