// Authenticated REST overrides must reject path-shaped slugs while accepting Enterprise managed-user suffixes.
import { describe, expect, it } from 'vitest'
import { isValidGitHubApiRepository } from './github-api-repository-validation'

describe('isValidGitHubApiRepository', () => {
  it('accepts plain and Enterprise Managed User owners', () => {
    expect(isValidGitHubApiRepository({ owner: 'acme', repo: 'markov' })).toBe(true)
    expect(isValidGitHubApiRepository({ owner: 'octocat_acme', repo: 'level5' })).toBe(true)
  })

  it('rejects leading underscore, hyphen, dot, and path-shaped owners', () => {
    expect(isValidGitHubApiRepository({ owner: '_acme', repo: 'markov' })).toBe(false)
    expect(isValidGitHubApiRepository({ owner: '-acme', repo: 'markov' })).toBe(false)
    expect(isValidGitHubApiRepository({ owner: '.acme', repo: 'markov' })).toBe(false)
    expect(isValidGitHubApiRepository({ owner: 'a/b', repo: 'markov' })).toBe(false)
  })

  it('rejects reserved and path-shaped repos', () => {
    expect(isValidGitHubApiRepository({ owner: 'acme', repo: '.' })).toBe(false)
    expect(isValidGitHubApiRepository({ owner: 'acme', repo: '..' })).toBe(false)
    expect(isValidGitHubApiRepository({ owner: 'acme', repo: 'a/b' })).toBe(false)
  })

  it.each([42, false, null, {}])('rejects a non-string repository host: %j', (host) => {
    expect(isValidGitHubApiRepository({ owner: 'acme', repo: 'markov', host })).toBe(false)
  })

  it.each([undefined, 'github.com', 'github.enterprise.test:8443'])(
    'accepts supported legacy or explicit repository host types: %j',
    (host) => {
      expect(isValidGitHubApiRepository({ owner: 'acme', repo: 'markov', host })).toBe(true)
    }
  )

  it.each([
    null,
    'acme/markov',
    { owner: 42, repo: 'markov' },
    { owner: 'acme', repo: 42 },
    { owner: 'acme' }
  ])('rejects malformed runtime repository identities: %j', (repository) => {
    expect(isValidGitHubApiRepository(repository)).toBe(false)
  })
})
