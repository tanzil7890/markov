import { describe, expect, it } from 'vitest'
import { findRepoForGitHubProjectRepository } from './github-project-repo-match'

const repos = [
  { id: 'repo-1', path: '/Users/me/markov', displayName: 'markov' },
  { id: 'repo-2', path: '/Users/me/other', displayName: 'other' }
]

describe('GitHub project repo matching', () => {
  it('does not path-match a repo whose resolved slug points somewhere else', () => {
    expect(
      findRepoForGitHubProjectRepository(
        'tanzil7890/markov',
        [{ id: 'repo-1', path: '/Users/me/tanzil7890/markov', displayName: 'markov' }],
        {
          'repo-1': {
            path: '/Users/me/tanzil7890/markov',
            repository: { owner: 'fork', repo: 'markov' }
          }
        }
      )
    ).toBeNull()
  })

  it('matches same-named repositories only on the active Project host', () => {
    expect(
      findRepoForGitHubProjectRepository(
        'tanzil7890/markov',
        repos,
        {
          'repo-1': {
            path: '/Users/me/markov',
            repository: { owner: 'tanzil7890', repo: 'markov', host: 'github.com' }
          },
          'repo-2': {
            path: '/Users/me/other',
            repository: {
              owner: 'tanzil7890',
              repo: 'markov',
              host: 'github.acme-corp.com'
            }
          }
        },
        'github.acme-corp.com'
      )
    ).toBe(repos[1])
  })

  it('scopes a host-less fork parent to the host the fork itself was cloned from', () => {
    const enterpriseFork = {
      id: 'repo-1',
      path: '/Users/me/widgets-mirror',
      displayName: 'widgets-mirror',
      upstream: { owner: 'acme', repo: 'widgets' }
    }
    const slugs = {
      'repo-1': {
        path: '/Users/me/widgets-mirror',
        repository: { owner: 'me', repo: 'widgets', host: 'github.acme-corp.com' }
      }
    }

    expect(
      findRepoForGitHubProjectRepository(
        'acme/widgets',
        [enterpriseFork],
        slugs,
        'github.acme-corp.com'
      )
    ).toBe(enterpriseFork)
    expect(findRepoForGitHubProjectRepository('acme/widgets', [enterpriseFork], slugs)).toBeNull()
  })

  it('does not use hostless path heuristics for Enterprise Project rows', () => {
    expect(
      findRepoForGitHubProjectRepository(
        'tanzil7890/markov',
        [{ id: 'repo-1', path: '/Users/me/tanzil7890/markov', displayName: 'markov' }],
        {},
        'github.acme-corp.com'
      )
    ).toBeNull()
  })
})
