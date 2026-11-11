import { NO_WORKSPACE_ROW_FILTERS } from '../../../src/shared/workspace-view/workspace-row-filters'
import { describe, expect, it } from 'vitest'
import { buildFilterRepos } from './workspace-filter-repos'
import { filterWorktrees, type Worktree } from './workspace-list-sections'

function row(worktreeId: string, repoId: string, hostId: Worktree['hostId']): Worktree {
  return {
    worktreeId,
    repoId,
    hostId,
    repo: 'markov',
    branch: 'feature',
    displayName: worktreeId,
    path: `/tmp/${worktreeId}`,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    unread: false,
    isPinned: false,
    linkedPR: null
  }
}

describe('the repo filter', () => {
  it("lists each host's same-named repo separately, by id, as the desktop's filter does", () => {
    const repos = buildFilterRepos(
      [
        {
          id: 'local-markov',
          displayName: 'markov',
          path: '/Users/me/markov',
          badgeColor: '#111111'
        },
        {
          id: 'm4-markov',
          displayName: 'markov',
          path: '/Users/m4air/markov/markov',
          executionHostId: 'runtime:m4air'
        },
        { id: 'assets', displayName: 'design-assets', path: '/Users/me/design-assets' },
        {
          id: 'local-markov',
          displayName: 'markov',
          path: '/srv/markov',
          executionHostId: 'runtime:other'
        }
      ],
      []
    )

    expect(repos.map(({ key, id, name }) => ({ key, id, name }))).toEqual([
      { key: 'local|local-markov', id: 'local-markov', name: 'markov' },
      { key: 'runtime:m4air|m4-markov', id: 'm4-markov', name: 'markov' },
      { key: 'local|assets', id: 'assets', name: 'design-assets' },
      { key: 'runtime:other|local-markov', id: 'local-markov', name: 'markov' }
    ])
    expect(repos[0]?.color).toBe('#111111')
  })

  it('lists the repos the rows name until a catalog answers, still one per repo id', () => {
    const repos = buildFilterRepos(
      [],
      [row('a', 'local-markov', 'local'), row('b', 'm4-markov', 'runtime:m4air')]
    )

    expect(repos.map((repo) => repo.id)).toEqual(['local-markov', 'm4-markov'])
  })

  it('filters by the picked repo id, leaving the same-named repo on another host out', () => {
    const rows = [row('a', 'local-markov', 'local'), row('b', 'm4-markov', 'runtime:m4air')]

    expect(
      filterWorktrees(rows, { ...NO_WORKSPACE_ROW_FILTERS, filterRepoIds: ['m4-markov'] }, '').map(
        (w) => w.worktreeId
      )
    ).toEqual(['b'])
  })
})
