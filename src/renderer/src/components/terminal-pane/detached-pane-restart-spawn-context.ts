import type { AppState } from '@/store'
import { getWorktreeMapFromState } from '@/store/selectors'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { selectFolderWorkspaces } from '@/store/workspace-record-selectors'

export function getWorkspacePath(state: AppState, worktreeId: string): string | null {
  const parsed = parseWorkspaceKey(worktreeId)
  return parsed?.type === 'folder'
    ? (selectFolderWorkspaces(state).find((workspace) => workspace.id === parsed.folderWorkspaceId)
        ?.folderPath ?? null)
    : (getWorktreeMapFromState(state).get(worktreeId)?.path ?? null)
}

export function buildPaneIdentityEnv(
  state: AppState,
  worktreeId: string,
  tabId: string,
  leafId: string
): Record<string, string> {
  const parsed = parseWorkspaceKey(worktreeId)
  const folderWorkspace =
    parsed?.type === 'folder'
      ? selectFolderWorkspaces(state).find((workspace) => workspace.id === parsed.folderWorkspaceId)
      : null
  return {
    MARKOV_WORKSPACE_ID: worktreeId,
    ...(folderWorkspace
      ? {
          MARKOV_PROJECT_GROUP_ID: folderWorkspace.projectGroupId,
          MARKOV_WORKSPACE_ROOT: folderWorkspace.folderPath
        }
      : {}),
    MARKOV_PANE_KEY: makePaneKey(tabId, leafId),
    MARKOV_TAB_ID: tabId,
    MARKOV_WORKTREE_ID: worktreeId
  }
}
