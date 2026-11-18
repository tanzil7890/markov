import { describe, expect, it } from 'vitest'
import { codexRuntimeUpkeepNeeded, type CodexRuntimeUpkeepFacts } from './codex-runtime-upkeep'

const BROKEN_HOST: CodexRuntimeUpkeepFacts = {
  enabled: true,
  explicitCommand: false,
  pinned: true,
  ownCodex: 'lacksHelper',
  managedCurrent: false,
  recentlyFailed: false
}

describe('installing Markov’s Codex on its own', () => {
  it('happens when the host’s own Codex is missing or lacks its helper', () => {
    expect(codexRuntimeUpkeepNeeded(BROKEN_HOST)).toBe(true)
    expect(codexRuntimeUpkeepNeeded({ ...BROKEN_HOST, ownCodex: 'missing' })).toBe(true)
  })

  it('is left alone when nothing would be gained or the user decided otherwise', () => {
    const left: Partial<CodexRuntimeUpkeepFacts>[] = [
      { ownCodex: 'whole' },
      { managedCurrent: true },
      { enabled: false },
      { explicitCommand: true },
      { pinned: false },
      { recentlyFailed: true }
    ]

    expect(left.map((facts) => codexRuntimeUpkeepNeeded({ ...BROKEN_HOST, ...facts }))).toEqual([
      false,
      false,
      false,
      false,
      false,
      false
    ])
  })
})
