import { describe, expect, it } from 'vitest'
import {
  deriveBrowserRoutePartition,
  deriveBrowserRoutePartitionStorageScope,
  isBrowserRoutePartition
} from './browser-route-identity'

const identity = {
  markovProfileId: 'markov/profile:alpha',
  browserProfileId: 'browser/profile:default',
  authorityConnectionIdentity: 'paired/runtime:authority',
  executionHostIdentity: 'ssh/target:private.example'
}

const pinnedIdentity = {
  markovProfileId: 'markov/profile:alpha',
  browserProfileId: 'browser/profile:default',
  authorityConnectionIdentity: 'paired-runtime:authority-a',
  executionHostIdentity: '["markov-browser-execution-host-storage",1,"authority","env-a"]'
}

describe('browser route partition identity', () => {
  it('keeps delimiter-containing components structurally distinct', () => {
    const left = deriveBrowserRoutePartition({
      ...identity,
      markovProfileId: 'a',
      browserProfileId: 'b:c'
    })
    const right = deriveBrowserRoutePartition({
      ...identity,
      markovProfileId: 'a:b',
      browserProfileId: 'c'
    })

    expect(left).not.toEqual(right)
  })

  it('makes every identity component load-bearing', () => {
    const derived = [
      identity,
      { ...identity, markovProfileId: 'markov/profile:beta' },
      { ...identity, browserProfileId: 'browser/profile:work' },
      { ...identity, authorityConnectionIdentity: 'paired/runtime:other' },
      { ...identity, executionHostIdentity: 'ssh/target:other.example' }
    ].map((entry) => deriveBrowserRoutePartition(entry))

    expect(new Set(derived.map((entry) => entry.partition)).size).toBe(derived.length)
    expect(new Set(derived.map((entry) => entry.bindingFingerprint)).size).toBe(derived.length)
  })

  // Persisted names must remain stable to avoid silently relocating cookie jars.
  it('pins the derived partition and fingerprint against silent relocation', () => {
    expect(deriveBrowserRoutePartition(pinnedIdentity)).toEqual({
      partition:
        'persist:markov-browser-v1-28a9d46c646d1b0ed89e54986afbfbef1dff98adfbd7b81392d86143fa89e777',
      bindingFingerprint: '350f1a9cb7ed52969b79369688e4d9ac932c870e689713c6d71197e4028c6d88'
    })
  })

  it('scopes partition ownership to one markov profile and one environment', () => {
    const scope = deriveBrowserRoutePartitionStorageScope({
      markovProfileId: 'markov/profile:alpha',
      environmentId: 'environment-a'
    })

    expect(scope).toBe('623f6a13a94c79195d37abfdbc86b7a6f5b5286eb0caf30f97ec219348bb6182')
    expect(
      deriveBrowserRoutePartitionStorageScope({
        markovProfileId: 'markov/profile:alpha',
        environmentId: 'environment-b'
      })
    ).not.toBe(scope)
    expect(
      deriveBrowserRoutePartitionStorageScope({
        markovProfileId: 'markov/profile:beta',
        environmentId: 'environment-a'
      })
    ).not.toBe(scope)
  })

  // These names are joined to the partition root for storage deletion.
  it('recognizes a route partition only as a whole name', () => {
    const valid = deriveBrowserRoutePartition(pinnedIdentity).partition

    expect(isBrowserRoutePartition(valid)).toBe(true)
    for (const value of [
      `../../${valid}`,
      `${valid}/../../escape`,
      `${valid}extra`,
      valid.replace('persist:', '')
    ]) {
      expect(isBrowserRoutePartition(value)).toBe(false)
    }
  })

  it('rejects empty and unbounded identity components', () => {
    expect(() => deriveBrowserRoutePartition({ ...identity, executionHostIdentity: '' })).toThrow(
      'browser_route_partition_identity_invalid'
    )
    expect(() =>
      deriveBrowserRoutePartition({ ...identity, authorityConnectionIdentity: 'x'.repeat(513) })
    ).toThrow('browser_route_partition_identity_invalid')
    expect(() =>
      deriveBrowserRoutePartition({ ...identity, authorityConnectionIdentity: 'é'.repeat(257) })
    ).toThrow('browser_route_partition_identity_invalid')
    expect(() =>
      deriveBrowserRoutePartition({ ...identity, authorityConnectionIdentity: 'é'.repeat(256) })
    ).not.toThrow()
  })
})
