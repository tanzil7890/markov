import { describe, expect, it } from 'vitest'
import { getLocalExecutionHostLabel } from '../../../src/shared/execution-host'
import {
  buildNewWorkspaceProjectOptions,
  buildNewWorkspaceRunTargetOptions,
  getNewWorkspaceRunTarget
} from './new-workspace-project-targets'

const LOCAL_HOST_LABEL = getLocalExecutionHostLabel('darwin')

describe('new workspace project targets', () => {
  it('groups local and SSH checkouts of the same project', () => {
    const upstream = { owner: 'tanzil7890', repo: 'markov' }
    const options = buildNewWorkspaceProjectOptions([
      { id: 'local', displayName: 'markov', path: '/src/markov', upstream },
      {
        id: 'ssh',
        displayName: 'markov',
        path: '/home/dev/markov',
        connectionId: 'build-server',
        upstream
      }
    ])

    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ label: 'markov', detail: 'tanzil7890/markov' })
  })

  it('shows the provider slug recovered from canonical git identity', () => {
    const options = buildNewWorkspaceProjectOptions([
      {
        id: 'local',
        displayName: 'markov',
        path: '/src/markov',
        gitRemoteIdentity: {
          canonicalKey: 'github.com/tanzil7890/markov',
          remoteName: 'origin',
          remoteUrl: 'git@github.com:tanzil7890/markov.git'
        }
      }
    ])

    expect(options[0]).toMatchObject({ label: 'markov', detail: 'tanzil7890/markov' })
  })

  it('labels local, SSH, and paired runtime targets as the host list names them', () => {
    expect(
      getNewWorkspaceRunTarget(
        { id: 'local', displayName: 'markov', path: '/src/markov' },
        'darwin'
      )
    ).toEqual({ hostId: 'local', label: LOCAL_HOST_LABEL, detail: '/src/markov' })
    expect(
      getNewWorkspaceRunTarget({ id: 'local', displayName: 'markov', path: 'C:\\src\\markov' })
    ).toMatchObject({ label: 'This computer' })
    expect(
      getNewWorkspaceRunTarget(
        { id: 'local', displayName: 'markov', path: 'C:\\src\\markov' },
        'win32'
      )
    ).toMatchObject({ label: 'Local Windows' })
    expect(
      getNewWorkspaceRunTarget({
        id: 'ssh',
        displayName: 'markov',
        path: 'C:\\src\\markov',
        executionHostId: 'ssh:Windows%20VM'
      })
    ).toEqual({ hostId: 'ssh:Windows%20VM', label: 'Windows VM', detail: 'C:\\src\\markov' })
    const server = {
      id: 'runtime',
      displayName: 'markov',
      path: '/src/markov',
      executionHostId: 'runtime:20269ff3-60aa-4e79-a581-513a3f8e394b'
    } as const
    const labels = new Map([[server.executionHostId, 'scratch-server']] as const)
    expect(getNewWorkspaceRunTarget(server, 'darwin', labels)).toEqual({
      hostId: server.executionHostId,
      label: 'scratch-server',
      detail: '/src/markov'
    })
  })

  it('shows one target per host when the project has multiple local worktrees', () => {
    const upstream = { owner: 'tanzil7890', repo: 'markov' }
    const repos = [
      { id: 'local-a', displayName: 'markov-a', path: '/src/markov-a', upstream },
      { id: 'local-b', displayName: 'markov-b', path: '/src/markov-b', upstream },
      {
        id: 'ssh',
        displayName: 'markov',
        path: '/home/dev/markov',
        connectionId: 'build-server',
        upstream
      }
    ]
    const projectId = buildNewWorkspaceProjectOptions(repos)[0]?.id ?? null

    expect(buildNewWorkspaceRunTargetOptions(repos, projectId, 'darwin')).toEqual([
      expect.objectContaining({ id: 'local', label: LOCAL_HOST_LABEL, detail: '/src/markov-a' }),
      expect.objectContaining({
        id: 'ssh:build-server',
        label: 'build-server',
        detail: '/home/dev/markov'
      })
    ])
  })
})
