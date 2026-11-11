import { describe, expect, it } from 'vitest'
import {
  extractGitHubIssueSourceError,
  extractGitHubIssueSourceFallback
} from './github-work-item-source-errors'

describe('extractGitHubIssueSourceError', () => {
  it('keeps the failing issue source slug with the repo that produced it', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/markov' },
        {
          sources: { issues: { owner: 'upstream', repo: 'markov' } },
          errors: { issues: { message: 'HTTP 403: resource not accessible' } }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/markov',
      source: { owner: 'upstream', repo: 'markov' },
      message: 'HTTP 403: resource not accessible'
    })
  })

  it('drops issue errors when the source slug is unavailable', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/markov' },
        {
          sources: { issues: null },
          errors: { issues: { message: 'failed' } }
        }
      )
    ).toBeNull()
  })

  it('returns null when the envelope has no issue-side error', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/markov' },
        {
          sources: { issues: { owner: 'tanzil7890', repo: 'markov' } }
        }
      )
    ).toBeNull()
  })
})

describe('extractGitHubIssueSourceFallback', () => {
  it('reports the repo whose upstream issue source fell back to origin', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/markov', displayName: 'markov' },
        {
          issueSourceFellBack: true,
          sources: {
            issues: { owner: 'tanzil7890', repo: 'markov-fork' },
            prs: { owner: 'tanzil7890', repo: 'markov' }
          }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/markov',
      repoLabel: 'tanzil7890/markov'
    })
  })

  it('uses the Markov repo display name when the PR source is unavailable', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/markov', displayName: 'markov' },
        {
          issueSourceFellBack: true,
          sources: { issues: null, prs: null }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/markov',
      repoLabel: 'markov'
    })
  })

  it('returns null when the source resolver did not fall back', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/markov', displayName: 'markov' },
        {
          sources: { issues: { owner: 'tanzil7890', repo: 'markov' } }
        }
      )
    ).toBeNull()
  })
})
