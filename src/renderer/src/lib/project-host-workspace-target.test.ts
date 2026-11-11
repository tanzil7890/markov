import { describe, expect, it } from 'vitest'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { Project, ProjectHostSetup } from '../../../shared/project-types'
import type { Repo } from '../../../shared/repo-types'
import {
  resolveWorkspaceCreationRepoId,
  resolveWorkspaceCreationTarget
} from './project-host-workspace-target'

function makeRepo(id: string, overrides: Partial<Repo> = {}): Repo {
  return {
    id,
    path: `/repos/${id}`,
    displayName: id,
    badgeColor: '#000000',
    addedAt: 1,
    ...overrides
  }
}

function makeProject(
  id: string,
  sourceRepoIds: string[],
  overrides: Partial<Project> = {}
): Project {
  return {
    id,
    displayName: id,
    badgeColor: '#000000',
    sourceRepoIds,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function makeSetup(
  id: string,
  projectId: string,
  hostId: ExecutionHostId,
  repoId: string,
  overrides: Partial<ProjectHostSetup> = {}
): ProjectHostSetup {
  return {
    id,
    projectId,
    hostId,
    repoId,
    path: `/repos/${repoId}`,
    displayName: repoId,
    setupState: 'ready',
    setupMethod: 'legacy-repo',
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('project-host workspace target resolution', () => {
  it('chooses the focused host setup when one project exists on multiple hosts', () => {
    const repos = [makeRepo('markov-local'), makeRepo('markov-ssh', { connectionId: 'openclaw-2' })]
    const projects = [makeProject('github:tanzil7890/markov', ['markov-local', 'markov-ssh'])]
    const projectHostSetups = [
      makeSetup('markov-local', 'github:tanzil7890/markov', 'local', 'markov-local'),
      makeSetup('markov-ssh', 'github:tanzil7890/markov', 'ssh:openclaw-2', 'markov-ssh')
    ]

    expect(
      resolveWorkspaceCreationRepoId({
        eligibleRepos: repos,
        projects,
        projectHostSetups,
        projectId: 'github:tanzil7890/markov',
        focusedHostScope: 'ssh:openclaw-2'
      })
    ).toBe('markov-ssh')
  })

  it('matches duplicate repo ids to the setup execution host', () => {
    const localRepo = makeRepo('markov', { path: '/local/markov' })
    const sshRepo = makeRepo('markov', {
      path: '/remote/markov',
      connectionId: 'builder'
    })
    const projects = [makeProject('github:tanzil7890/markov', ['markov'])]
    const projectHostSetups = [
      makeSetup('local-setup', 'github:tanzil7890/markov', 'local', 'markov'),
      makeSetup('ssh-setup', 'github:tanzil7890/markov', 'ssh:builder', 'markov')
    ]

    const resolution = resolveWorkspaceCreationTarget({
      eligibleRepos: [localRepo, sshRepo],
      projects,
      projectHostSetups,
      projectHostSetupId: 'ssh-setup'
    })

    expect(resolution).toMatchObject({
      status: 'ready',
      target: {
        hostId: 'ssh:builder',
        repo: { path: '/remote/markov', connectionId: 'builder' }
      }
    })
  })

  it('keeps a focused duplicate repo id on its selected host', () => {
    const localRepo = makeRepo('markov', { path: '/local/markov' })
    const sshRepo = makeRepo('markov', { path: '/remote/markov', connectionId: 'builder' })
    const projects = [makeProject('github:tanzil7890/markov', ['markov'])]
    const projectHostSetups = [
      makeSetup('local-setup', 'github:tanzil7890/markov', 'local', 'markov'),
      makeSetup('ssh-setup', 'github:tanzil7890/markov', 'ssh:builder', 'markov')
    ]

    expect(
      resolveWorkspaceCreationTarget({
        eligibleRepos: [localRepo, sshRepo],
        projects,
        projectHostSetups,
        draftRepoId: 'markov',
        focusedHostScope: 'ssh:builder'
      })
    ).toMatchObject({
      status: 'ready',
      target: {
        hostId: 'ssh:builder',
        projectHostSetupId: 'ssh-setup',
        repo: { path: '/remote/markov', connectionId: 'builder' }
      }
    })
  })

  it('resolves duplicate repo ids to a ready setup when no host is focused', () => {
    const localRepo = makeRepo('markov', { path: '/local/markov' })
    const sshRepo = makeRepo('markov', { path: '/remote/markov', connectionId: 'builder' })
    const projects = [makeProject('github:tanzil7890/markov', ['markov'])]
    const projectHostSetups = [
      makeSetup('local-setup', 'github:tanzil7890/markov', 'local', 'markov'),
      makeSetup('ssh-setup', 'github:tanzil7890/markov', 'ssh:builder', 'markov')
    ]

    expect(
      resolveWorkspaceCreationTarget({
        eligibleRepos: [localRepo, sshRepo],
        projects,
        projectHostSetups,
        draftRepoId: 'markov',
        focusedHostScope: 'all',
        actionableHostIds: new Set(['local', 'ssh:builder'])
      })
    ).toMatchObject({
      status: 'ready',
      target: {
        hostId: 'local',
        projectHostSetupId: 'local-setup',
        repoId: 'markov',
        repo: { path: '/local/markov' }
      }
    })
  })

  it('canonicalizes a duplicate setup of the same checkout to the first one', () => {
    const repos = [makeRepo('markov-main'), makeRepo('markov-twin')]
    const projects = [makeProject('github:tanzil7890/markov', ['markov-main', 'markov-twin'])]
    const projectHostSetups = [
      makeSetup('markov-main', 'github:tanzil7890/markov', 'local', 'markov-main'),
      makeSetup('markov-twin', 'github:tanzil7890/markov', 'local', 'markov-twin', {
        path: '/repos/markov-main/'
      })
    ]

    const resolution = resolveWorkspaceCreationTarget({
      eligibleRepos: repos,
      projects,
      projectHostSetups,
      projectHostSetupId: 'markov-twin'
    })

    expect(resolution).toMatchObject({
      status: 'ready',
      target: { projectHostSetupId: 'markov-main', repoId: 'markov-main', hostId: 'local' }
    })
  })

  it('keeps an explicit setup for a second checkout of the project on the same host', () => {
    // Two clones of one remote share a project; the picker lists each, so the chosen one must be created in.
    const repos = [makeRepo('markov-main'), makeRepo('markov-review')]
    const projects = [makeProject('github:tanzil7890/markov', ['markov-main', 'markov-review'])]
    const projectHostSetups = [
      makeSetup('markov-main', 'github:tanzil7890/markov', 'local', 'markov-main'),
      makeSetup('markov-review', 'github:tanzil7890/markov', 'local', 'markov-review')
    ]

    const resolution = resolveWorkspaceCreationTarget({
      eligibleRepos: repos,
      projects,
      projectHostSetups,
      projectHostSetupId: 'markov-review'
    })

    expect(resolution).toMatchObject({
      status: 'ready',
      target: { projectHostSetupId: 'markov-review', repoId: 'markov-review', hostId: 'local' }
    })
  })

  it('does not merge same-name repos without shared project identity', () => {
    const repos = [
      makeRepo('personal-markov', { displayName: 'markov' }),
      makeRepo('work-markov', { displayName: 'markov', connectionId: 'work-linux' })
    ]

    expect(
      resolveWorkspaceCreationRepoId({
        eligibleRepos: repos,
        projectId: 'repo:personal-markov',
        focusedHostScope: 'ssh:work-linux'
      })
    ).toBe('personal-markov')
  })

  it('does not fall back to another host when only a host is selected', () => {
    const localRepo = makeRepo('markov-local')
    const remoteRepo = makeRepo('markov-ssh', { connectionId: 'builder' })
    const projects = [makeProject('github:tanzil7890/markov', ['markov-local', 'markov-ssh'])]
    const projectHostSetups = [
      makeSetup('markov-local', 'github:tanzil7890/markov', 'local', 'markov-local')
    ]

    expect(
      resolveWorkspaceCreationTarget({
        eligibleRepos: [localRepo, remoteRepo],
        projects,
        projectHostSetups,
        draftRepoId: 'markov-local',
        hostId: 'ssh:builder',
        actionableHostIds: new Set(['local', 'ssh:builder'])
      })
    ).toEqual({
      status: 'unavailable',
      reason: 'project-not-set-up-on-host'
    })
  })

  it('reports setup-not-ready when the selected host has pending setup metadata', () => {
    const repo = makeRepo('markov')
    const projects = [makeProject('github:tanzil7890/markov', ['markov'])]
    const projectHostSetups = [
      makeSetup('markov', 'github:tanzil7890/markov', 'local', 'markov'),
      makeSetup('gpu-pending', 'github:tanzil7890/markov', 'runtime:gpu', '', {
        path: '',
        setupState: 'setting-up',
        setupMethod: 'provisioned'
      })
    ]

    expect(
      resolveWorkspaceCreationTarget({
        eligibleRepos: [repo],
        projects,
        projectHostSetups,
        projectId: 'github:tanzil7890/markov',
        hostId: 'runtime:gpu'
      })
    ).toEqual({
      status: 'unavailable',
      reason: 'setup-not-ready'
    })
  })

  it('does not silently switch an explicit setup id to an actionable sibling host', () => {
    const remoteRepo = makeRepo('remote-repo', { connectionId: 'removed' })
    const localRepo = makeRepo('local-repo')
    const projects = [makeProject('repo:markov', ['remote-repo', 'local-repo'])]
    const projectHostSetups = [
      makeSetup('removed-setup', 'repo:markov', 'ssh:removed', 'remote-repo'),
      makeSetup('local-setup', 'repo:markov', 'local', 'local-repo')
    ]

    expect(
      resolveWorkspaceCreationTarget({
        eligibleRepos: [remoteRepo, localRepo],
        projects,
        projectHostSetups,
        draftRepoId: remoteRepo.id,
        projectHostSetupId: 'removed-setup',
        actionableHostIds: new Set(['local'])
      })
    ).toEqual({ status: 'unavailable', reason: 'setup-not-found' })
  })

  // Project selection treats the current host as preference; a project available only elsewhere must resolve there instead of silently returning empty.
  describe('cross-host project selection', () => {
    const repos = [makeRepo('local-repo'), makeRepo('remote-repo', { connectionId: 'remote-1' })]
    const projects = [
      makeProject('repo:local-repo', ['local-repo']),
      makeProject('repo:remote-repo', ['remote-repo'])
    ]
    const projectHostSetups = [
      makeSetup('local-repo', 'repo:local-repo', 'local', 'local-repo'),
      makeSetup('remote-repo', 'repo:remote-repo', 'ssh:remote-1', 'remote-repo')
    ]

    it('resolves a remote-only project while the current host is local', () => {
      expect(
        resolveWorkspaceCreationRepoId({
          eligibleRepos: repos,
          projects,
          projectHostSetups,
          projectId: 'repo:remote-repo',
          focusedHostScope: 'local'
        })
      ).toBe('remote-repo')
    })

    it('still reports unavailable for an explicit project+host with no ready setup', () => {
      // Explicit Run on host selection retains strict project+host matching; only project-dropdown calls use preference.
      expect(
        resolveWorkspaceCreationTarget({
          eligibleRepos: repos,
          projects,
          projectHostSetups,
          projectId: 'repo:remote-repo',
          hostId: 'local'
        })
      ).toEqual({
        status: 'unavailable',
        reason: 'project-not-set-up-on-host'
      })
    })
  })
})
