// Host answers both the desktop sidebar's and the phone's Project grouping tests run on.
import type { MobileProjectSectionCatalog } from './mobile-project-sections-contract'
import type { ExecutionHostId } from './execution-host'
import {
  projectHostSetupProjectionFromRepos,
  type ProjectHostSetupProjection
} from './project-host-setup-projection'
import type { Repo } from './repo-types'
import type { RuntimeClientTarget } from './runtime-client-target'

const markovRemote = {
  canonicalKey: 'github.com/tanzil7890/markov',
  remoteName: 'origin',
  remoteUrl: 'git@github.com:tanzil7890/markov.git'
}

function hostRepo(id: string, path: string, displayName = 'markov'): Repo {
  return {
    id,
    path,
    displayName,
    badgeColor: '#737373',
    addedAt: 1,
    ...(displayName === 'markov' ? { gitRemoteIdentity: markovRemote } : {})
  }
}

export type ParityHostAnswer = {
  target: RuntimeClientTarget
  hostId: ExecutionHostId
  /** In the host's own repo.list order. */
  repos: Repo[]
  /** The host's project.list/projectHostSetup.list rows; null for a host that predates them. */
  lists: ProjectHostSetupProjection | null
}

const localRepos = [
  hostRepo('local-acme', '/Users/alice/acme/markov'),
  hostRepo('local-assets', '/Users/alice/design-assets', 'design-assets'),
  hostRepo('local-workspace', '/Users/alice/markov/workspaces/markov/markov')
]
const windowsRepo = hostRepo('win-markov', 'C:/Users/casey/markov/markov')

// Several local checkouts plus copies of the same project on two servers.
export const PROJECT_SECTION_PARITY_HOSTS: readonly ParityHostAnswer[] = [
  {
    target: { kind: 'local' },
    hostId: 'local',
    repos: localRepos,
    lists: projectHostSetupProjectionFromRepos(localRepos)
  },
  {
    target: { kind: 'environment', environmentId: 'windows2' },
    hostId: 'runtime:windows2',
    repos: [windowsRepo],
    // A server's own catalog rows: its project name and an imported setup on its local host.
    lists: {
      projects: [
        {
          id: 'github:tanzil7890/markov',
          displayName: 'Markov',
          badgeColor: '#737373',
          providerIdentity: { provider: 'github', owner: 'tanzil7890', repo: 'markov' },
          sourceRepoIds: [windowsRepo.id],
          createdAt: 5,
          updatedAt: 5
        }
      ],
      setups: [
        {
          id: 'win-setup',
          projectId: 'github:tanzil7890/markov',
          hostId: 'local',
          repoId: windowsRepo.id,
          path: windowsRepo.path,
          displayName: 'markov',
          setupState: 'ready',
          setupMethod: 'imported-existing-folder',
          createdAt: 5,
          updatedAt: 5
        }
      ]
    }
  },
  {
    target: { kind: 'environment', environmentId: 'm4air' },
    hostId: 'runtime:m4air',
    repos: [
      hostRepo('m4-markov', '/Users/m4air/markov/markov'),
      hostRepo('m4-markov-two', '/Users/m4air/markov-two/markov')
    ],
    lists: null
  }
]

/** Workspace rows; activity order differs from catalog order, so Recent and Manual disagree. */
export const PROJECT_SECTION_PARITY_ROWS: readonly {
  id: string
  repoId: string
  lastActivityAt: number
}[] = [
  { id: 'wt-m4-two', repoId: 'm4-markov-two', lastActivityAt: 90 },
  { id: 'wt-win', repoId: 'win-markov', lastActivityAt: 70 },
  { id: 'wt-workspace', repoId: 'local-workspace', lastActivityAt: 50 },
  { id: 'wt-acme', repoId: 'local-acme', lastActivityAt: 30 },
  { id: 'wt-m4', repoId: 'm4-markov', lastActivityAt: 10 }
]

// Same-host checkouts still need path prefixes; other machines do not.
const ACME = {
  key: 'project:github:tanzil7890/markov::setup:local-acme',
  label: 'acme/markov'
}
const WORKSPACE = {
  key: 'project:github:tanzil7890/markov::setup:local-workspace',
  label: 'markov/markov'
}
// Why 'markov', not the server's 'Markov': the later host's derived project name wins the merge.
const WINDOWS = { key: 'project:github:tanzil7890/markov', label: 'markov' }
const M4 = { key: 'project:github:tanzil7890/markov::setup:m4-markov', label: 'markov/markov' }
const M4_TWO = {
  key: 'project:github:tanzil7890/markov::setup:m4-markov-two',
  label: 'markov-two/markov'
}
const ASSETS = { key: 'project:repo:local-assets', label: 'design-assets' }

export const PROJECT_SECTION_PARITY_HEADERS = {
  recent: [M4_TWO, WINDOWS, WORKSPACE, ACME, M4, ASSETS],
  manual: [ACME, ASSETS, WORKSPACE, WINDOWS, M4, M4_TWO]
} as const

/** What main serves the phone for these answers (the renderer's published catalog). */
export const PROJECT_SECTION_PARITY_SERVED: MobileProjectSectionCatalog = {
  repos: [
    {
      id: 'local-acme',
      displayName: 'markov',
      path: '/Users/alice/acme/markov',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'local'
    },
    {
      id: 'local-assets',
      displayName: 'design-assets',
      path: '/Users/alice/design-assets',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'local'
    },
    {
      id: 'local-workspace',
      displayName: 'markov',
      path: '/Users/alice/markov/workspaces/markov/markov',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'local'
    },
    {
      id: 'win-markov',
      displayName: 'markov',
      path: 'C:/Users/casey/markov/markov',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'runtime:windows2'
    },
    {
      id: 'm4-markov',
      displayName: 'markov',
      path: '/Users/m4air/markov/markov',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'runtime:m4air'
    },
    {
      id: 'm4-markov-two',
      displayName: 'markov',
      path: '/Users/m4air/markov-two/markov',
      badgeColor: '#737373',
      addedAt: 1,
      executionHostId: 'runtime:m4air'
    }
  ],
  projects: [
    { id: 'repo:local-assets', displayName: 'design-assets' },
    { id: 'github:tanzil7890/markov', displayName: 'markov' }
  ],
  setups: [
    {
      id: 'local-acme',
      projectId: 'github:tanzil7890/markov',
      hostId: 'local',
      repoId: 'local-acme',
      path: '/Users/alice/acme/markov',
      displayName: 'markov',
      setupMethod: 'legacy-repo'
    },
    {
      id: 'local-assets',
      projectId: 'repo:local-assets',
      hostId: 'local',
      repoId: 'local-assets',
      path: '/Users/alice/design-assets',
      displayName: 'design-assets',
      setupMethod: 'legacy-repo'
    },
    {
      id: 'local-workspace',
      projectId: 'github:tanzil7890/markov',
      hostId: 'local',
      repoId: 'local-workspace',
      path: '/Users/alice/markov/workspaces/markov/markov',
      displayName: 'markov',
      setupMethod: 'legacy-repo'
    },
    {
      id: 'win-setup',
      projectId: 'github:tanzil7890/markov',
      hostId: 'runtime:windows2',
      repoId: 'win-markov',
      path: 'C:/Users/casey/markov/markov',
      displayName: 'markov',
      setupMethod: 'imported-existing-folder',
      connectionId: null,
      executionHostId: 'runtime:windows2'
    },
    {
      id: 'm4-markov',
      projectId: 'github:tanzil7890/markov',
      hostId: 'runtime:m4air',
      repoId: 'm4-markov',
      path: '/Users/m4air/markov/markov',
      displayName: 'markov',
      setupMethod: 'legacy-repo',
      executionHostId: 'runtime:m4air'
    },
    {
      id: 'm4-markov-two',
      projectId: 'github:tanzil7890/markov',
      hostId: 'runtime:m4air',
      repoId: 'm4-markov-two',
      path: '/Users/m4air/markov-two/markov',
      displayName: 'markov',
      setupMethod: 'legacy-repo',
      executionHostId: 'runtime:m4air'
    }
  ],
  projectOrderBy: 'manual'
}
