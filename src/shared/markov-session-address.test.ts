import { describe, expect, it } from 'vitest'
import {
  formatMarkovSessionAddress,
  isMarkovSessionId,
  parseMarkovSessionAddress
} from './markov-session-address'
import { testMarkovSessionId } from './markov-session-address-test-fixture'

const SESSION_ID = testMarkovSessionId('0b7e4c2a-5f1d-4e8a-9c3b-2d6f8a1e4b70')
const ADDRESS = `markov_session_id:${SESSION_ID}`

describe('Markov session address', () => {
  it('addresses a Markov session id as markov_session_id:<id> and parses the bare id back', () => {
    expect(formatMarkovSessionAddress(SESSION_ID)).toBe(ADDRESS)
    expect(parseMarkovSessionAddress(ADDRESS)).toBe(SESSION_ID)
    const parsed = parseMarkovSessionAddress(ADDRESS)
    expect(parsed && formatMarkovSessionAddress(parsed)).toBe(ADDRESS)
  })

  it('reads only the addressed spelling when parsing an address', () => {
    // A bare id is what the columns store, not an address.
    expect(parseMarkovSessionAddress(SESSION_ID)).toBeNull()
    expect(parseMarkovSessionAddress(null)).toBeNull()
    expect(parseMarkovSessionAddress(undefined)).toBeNull()
    expect(parseMarkovSessionAddress('')).toBeNull()
  })

  it.each([
    ['an unknown prefix', `pane:${SESSION_ID}`],
    ['the Run mailbox namespace', 'run:run_123'],
    ['the Dispatch mailbox namespace', 'dispatch:ctx_123'],
    ['an empty prefix', `:${SESSION_ID}`],
    ['an empty id', 'markov_session_id:'],
    ['an id with a separator', `markov_session_id:${SESSION_ID}:extra`],
    ['an id the session predicate rejects', 'markov_session_id:short'],
    ['a terminal handle', 'term_4f2c9a']
  ])('refuses %s', (_label, value) => {
    expect(parseMarkovSessionAddress(value)).toBeNull()
  })

  it('no longer reads the retired session:<id> spelling as a session, as an address or a bare id', () => {
    expect(parseMarkovSessionAddress(`session:${SESSION_ID}`)).toBeNull()
    expect(isMarkovSessionId(`session:${SESSION_ID}`)).toBe(false)
  })

  it.each([
    ['a PTY terminal handle', 'term_4f2c9a1b-7d3e-4a5f-8b6c-9d0e1f2a3b4c'],
    ['a short PTY terminal handle', 'term_4f2c9a'],
    ['a structured-worker handle', 'structworker_4f2c9a1b-7d3e-4a5f-8b6c-9d0e1f2a3b4c']
  ])('never treats %s as a Markov session id', (_label, handle) => {
    // Handles share the session-id charset, so the session-record predicate alone would accept them.
    expect(isMarkovSessionId(handle)).toBe(false)
    expect(parseMarkovSessionAddress(`markov_session_id:${handle}`)).toBeNull()
  })

  it('validates a Markov session id with the session-record predicate', () => {
    expect(isMarkovSessionId(SESSION_ID)).toBe(true)
    expect(isMarkovSessionId('has space in it')).toBe(false)
    expect(isMarkovSessionId('x'.repeat(129))).toBe(false)
  })
})
