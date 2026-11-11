import type { Repo } from '../../../shared/repo-types'

export function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-local',
    path: '/local/markov',
    displayName: 'Markov',
    badgeColor: '#737373',
    addedAt: 1,
    ...overrides
  }
}
