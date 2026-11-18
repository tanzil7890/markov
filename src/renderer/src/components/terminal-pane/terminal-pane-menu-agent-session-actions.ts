import type { ManagedPane } from '@/lib/pane-manager/pane-manager'
import type { PaneCwdMap } from './resolve-split-cwd'
import {
  copyAgentSessionContextFromPane,
  prepareAgentSessionForkFromPane,
  type PreparedAgentSessionFork
} from './terminal-agent-session-fork'

export type TerminalPaneMenuAgentSessionContext = {
  paneCwdRef: React.RefObject<PaneCwdMap>
  tabId: string
  worktreeId: string
  groupId: string | null
  fallbackCwd: string
  onAgentSessionForkReady: (fork: PreparedAgentSessionFork) => void
}

export const forkAgentSessionFromMenuPane = async (
  context: TerminalPaneMenuAgentSessionContext,
  pane: ManagedPane | null
): Promise<void> => {
  if (!pane) {
    return
  }
  const { tabId, worktreeId, groupId } = context
  const fork = prepareAgentSessionForkFromPane({ pane, tabId, worktreeId, groupId })
  if (fork) {
    context.onAgentSessionForkReady(fork)
  }
}

// Copy standalone bounded context without fork framing or opening the fork dialog (#5020).
export const copyAgentSessionContextFromMenuPane = async (
  pane: ManagedPane | null
): Promise<void> => {
  if (!pane) {
    return
  }
  await copyAgentSessionContextFromPane(pane)
}
