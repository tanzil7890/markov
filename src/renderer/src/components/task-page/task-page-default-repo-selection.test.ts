import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import {
  getDefaultTaskRepoSelection,
  getTaskEligibleRepos,
  getTaskProjectPickerGroups,
  normalizeTaskRepoSelection
} from './task-page-default-repo-selection'

function repo(overrides: Partial<Repo> & Pick<Repo, 'id'>): Repo {
  return {
    path: `/repos/${overrides.id}`,
    displayName: overrides.id,
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git',
    ...overrides
  }
}

describe('getTaskEligibleRepos', () => {
  it('keeps only Git repos with a resolvable remote identity', () => {
    const eligible = getTaskEligibleRepos([
      repo({ id: 'github-upstream', upstream: { owner: 'tanzil7890', repo: 'markov' } }),
      repo({
        id: 'github-icon',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/tanzil7890.png?size=64',
          source: 'github',
          label: 'tanzil7890/markov'
        }
      }),
      repo({
        id: 'gitlab-remote',
        gitRemoteIdentity: {
          canonicalKey: 'gitlab.example.com/team/markov',
          remoteName: 'origin',
          remoteUrl: 'git@gitlab.example.com:team/markov.git'
        }
      }),
      repo({ id: 'settled-no-remote', gitRemoteIdentity: null }),
      repo({
        id: 'incomplete-remote',
        gitRemoteIdentity: {
          canonicalKey: 'gitlab.example.com/team/incomplete',
          remoteName: '',
          remoteUrl: 'git@gitlab.example.com:team/incomplete.git'
        }
      }),
      repo({
        id: 'folder-with-remote',
        kind: 'folder',
        upstream: { owner: 'tanzil7890', repo: 'docs' }
      })
    ])

    expect(eligible.map((candidate) => candidate.id)).toEqual([
      'github-upstream',
      'github-icon',
      'gitlab-remote'
    ])
  })

  it('keeps a repo visible while its remote identity probe has not answered', () => {
    const eligible = getTaskEligibleRepos([
      repo({ id: 'probe-pending' }),
      repo({ id: 'ssh-probe-pending', connectionId: 'builder' }),
      repo({ id: 'settled-no-remote', gitRemoteIdentity: null })
    ])

    expect(eligible.map((candidate) => candidate.id)).toEqual([
      'probe-pending',
      'ssh-probe-pending'
    ])
  })

  it('excludes folders and settled remote-less repos even while others are pending', () => {
    const eligible = getTaskEligibleRepos([
      repo({ id: 'folder-pending', kind: 'folder' }),
      repo({ id: 'folder-settled', kind: 'folder', gitRemoteIdentity: null }),
      repo({ id: 'git-pending' })
    ])

    expect(eligible.map((candidate) => candidate.id)).toEqual(['git-pending'])
  })

  it('treats a partially resolved remote identity as settled, not pending', () => {
    const eligible = getTaskEligibleRepos([
      repo({
        id: 'gitlab-ssh-partial',
        connectionId: 'builder',
        gitRemoteIdentity: {
          canonicalKey: 'gitlab.example.com/team/markov',
          remoteName: 'origin',
          remoteUrl: ''
        }
      }),
      repo({
        id: 'gitlab-ssh-complete',
        connectionId: 'builder',
        gitRemoteIdentity: {
          canonicalKey: 'gitlab.example.com/team/markov',
          remoteName: 'origin',
          remoteUrl: 'git@gitlab.example.com:team/markov.git'
        }
      })
    ])

    expect(eligible.map((candidate) => candidate.id)).toEqual(['gitlab-ssh-complete'])
  })
})

describe('getDefaultTaskRepoSelection', () => {
  it('selects one source per logical GitHub project', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'local-markov',
        upstream: { owner: 'Tanzil7890', repo: 'Markov' }
      }),
      repo({
        id: 'ssh-markov',
        connectionId: 'builder',
        upstream: { owner: 'tanzil7890', repo: 'markov' }
      }),
      repo({
        id: 'other',
        upstream: { owner: 'tanzil7890', repo: 'other' }
      })
    ])

    expect([...selection].sort()).toEqual(['local-markov', 'other'])
  })

  it('keeps GitHub grouping intact while a pending-identity repo joins as its own project', () => {
    const selection = getDefaultTaskRepoSelection(
      getTaskEligibleRepos([
        repo({ id: 'local-markov', upstream: { owner: 'Tanzil7890', repo: 'Markov' } }),
        repo({
          id: 'ssh-markov',
          connectionId: 'builder',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        }),
        repo({ id: 'ssh-gitlab-pending', connectionId: 'builder' })
      ])
    )

    expect([...selection].sort()).toEqual(['local-markov', 'ssh-gitlab-pending'])
  })

  it('prefers local checkout over a remote checkout for the same project', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'ssh-markov',
        addedAt: 1,
        connectionId: 'builder',
        upstream: { owner: 'tanzil7890', repo: 'markov' }
      }),
      repo({
        id: 'local-markov',
        addedAt: 2,
        upstream: { owner: 'tanzil7890', repo: 'markov' }
      })
    ])

    expect([...selection]).toEqual(['local-markov'])
  })

  it('keeps same-named folders separate when provider identity is missing', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({ id: 'local-app', displayName: 'app' }),
      repo({ id: 'ssh-app', displayName: 'app', connectionId: 'builder' })
    ])

    expect([...selection].sort()).toEqual(['local-app', 'ssh-app'])
  })

  it('uses GitHub repo icon metadata to identify legacy duplicate projects', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'local-claude-swap',
        displayName: 'claude-swap',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/tanzil7890.png?size=64',
          source: 'github',
          label: 'tanzil7890/claude-swap'
        }
      }),
      repo({
        id: 'ssh-claude-swap',
        displayName: 'claude-swap',
        connectionId: 'builder',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/tanzil7890.png?size=64',
          source: 'github',
          label: 'Tanzil7890/claude-swap'
        }
      })
    ])

    expect([...selection]).toEqual(['local-claude-swap'])
  })
})

describe('getTaskProjectPickerGroups', () => {
  it('keeps all host sources under one logical project row', () => {
    const groups = getTaskProjectPickerGroups([
      repo({
        id: 'local-markov',
        upstream: { owner: 'tanzil7890', repo: 'markov' }
      }),
      repo({
        id: 'ssh-markov',
        connectionId: 'builder',
        upstream: { owner: 'tanzil7890', repo: 'markov' }
      }),
      repo({
        id: 'docs',
        upstream: { owner: 'tanzil7890', repo: 'docs' }
      })
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      projectKey: 'github:tanzil7890/markov',
      repo: { id: 'local-markov' }
    })
    expect(groups[0]?.sources.map((source) => source.id)).toEqual(['local-markov', 'ssh-markov'])
    expect(groups[1]).toMatchObject({
      projectKey: 'github:tanzil7890/docs',
      repo: { id: 'docs' }
    })
  })

  it('uses the explicitly selected source as the project representative', () => {
    const groups = getTaskProjectPickerGroups(
      [
        repo({
          id: 'local-markov',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        }),
        repo({
          id: 'ssh-markov',
          connectionId: 'builder',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        })
      ],
      new Set(['ssh-markov'])
    )

    expect(groups[0]?.repo.id).toBe('ssh-markov')
    expect(groups[0]?.sources.map((source) => source.id)).toEqual(['local-markov', 'ssh-markov'])
  })
})

describe('normalizeTaskRepoSelection', () => {
  it('collapses duplicate selected sources for the same logical project', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-markov',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        }),
        repo({
          id: 'ssh-markov',
          connectionId: 'builder',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        })
      ],
      new Set(['local-markov', 'ssh-markov'])
    )

    expect([...selection]).toEqual(['local-markov'])
  })

  it('preserves a single explicit remote source selection', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-markov',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        }),
        repo({
          id: 'ssh-markov',
          connectionId: 'builder',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        })
      ],
      new Set(['ssh-markov'])
    )

    expect([...selection]).toEqual(['ssh-markov'])
  })

  it('normalizes raw all-host selection to one source per logical project', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-markov',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        }),
        repo({
          id: 'ssh-markov',
          connectionId: 'builder',
          upstream: { owner: 'tanzil7890', repo: 'markov' }
        }),
        repo({
          id: 'docs',
          upstream: { owner: 'tanzil7890', repo: 'docs' }
        })
      ],
      new Set(['local-markov', 'ssh-markov', 'docs'])
    )

    expect([...selection].sort()).toEqual(['docs', 'local-markov'])
  })
})
