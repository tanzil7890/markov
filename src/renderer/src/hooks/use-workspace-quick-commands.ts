import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useProjectHostSetupProjection } from '@/store/selectors'
import { terminalQuickCommandMatchesWorkspaceProject } from '@/lib/terminal-quick-command-project-scope'
import {
  getTerminalQuickCommandScope,
  isTerminalQuickCommandComplete
} from '../../../shared/terminal/quick-commands/terminal-quick-commands'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import {
  flattenTerminalQuickCommandHosts,
  type HostedTerminalQuickCommand,
  useTerminalQuickCommandHosts
} from './use-terminal-quick-command-hosts'

/** Saved commands that apply to a workspace: its project's first, then the ones saved for everywhere. */
export function useWorkspaceQuickCommands(worktreeId: string) {
  const repos = useAppStore((s) => s.repos)
  const projectHostSetupProjection = useProjectHostSetupProjection()
  const hostState = useTerminalQuickCommandHosts(worktreeId)
  const { executionHostId, hosts } = hostState
  // Floating terminals have a synthetic workspace ID without a repo; never treat that sentinel as a run target.
  const repoId = useMemo(() => {
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      return null
    }
    const candidate = getRepoIdFromWorktreeId(worktreeId)
    return repos.some((r) => r.id === candidate) ? candidate : null
  }, [worktreeId, repos])

  const { repoCommands, globalCommands } = useMemo(() => {
    const repoList: HostedTerminalQuickCommand[] = []
    const globalList: HostedTerminalQuickCommand[] = []
    for (const entry of flattenTerminalQuickCommandHosts(hosts)) {
      const { command } = entry
      if (!isTerminalQuickCommandComplete(command)) {
        continue
      }
      const scope = getTerminalQuickCommandScope(command)
      if (scope.type === 'global') {
        globalList.push(entry)
      } else if (
        scope.type === 'repo' &&
        terminalQuickCommandMatchesWorkspaceProject(command, {
          commandHostId: entry.hostId,
          projectHostSetups: projectHostSetupProjection.setups,
          targetHostId: executionHostId,
          targetRepoId: repoId
        })
      ) {
        repoList.push(entry)
      }
    }
    return { repoCommands: repoList, globalCommands: globalList }
  }, [executionHostId, hosts, projectHostSetupProjection.setups, repoId])

  const defaultHostId = hosts.some((host) => host.hostId === executionHostId)
    ? executionHostId
    : hosts[0].hostId

  return { ...hostState, repoId, repos, repoCommands, globalCommands, defaultHostId }
}
