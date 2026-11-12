import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import type { Worktree } from '../../../../../shared/worktree/types'
import { findGithubWorkItemWorkspaceAttachment } from '@/lib/work-items/github/github-work-item-workspace-attachment'

type GroupableGitHubWorkItem = Pick<GitHubWorkItem, 'type' | 'number' | 'url'> & {
  repoId?: string | null
}

export type GitHubTaskRowGroupId = 'in-workspace' | 'not-started' | 'all'

export type GitHubTaskRowGroup<T> = {
  id: GitHubTaskRowGroupId
  rows: { item: T; attachedWorkspace: Worktree | null }[]
}

/** Lists work items that already have a workspace first, keeping each group's original order. */
export function groupGitHubTaskRows<T extends GroupableGitHubWorkItem>(
  items: readonly T[],
  worktrees: readonly Worktree[]
): GitHubTaskRowGroup<T>[] {
  const inWorkspace: GitHubTaskRowGroup<T>['rows'] = []
  const notStarted: GitHubTaskRowGroup<T>['rows'] = []
  for (const item of items) {
    const attachedWorkspace = findGithubWorkItemWorkspaceAttachment(
      worktrees,
      item.repoId,
      item.type,
      item.number,
      item.url
    )
    ;(attachedWorkspace ? inWorkspace : notStarted).push({ item, attachedWorkspace })
  }
  // Why: with nothing in a workspace, section headers would only add noise.
  if (inWorkspace.length === 0) {
    return [{ id: 'all', rows: notStarted }]
  }
  const groups: GitHubTaskRowGroup<T>[] = [{ id: 'in-workspace', rows: inWorkspace }]
  if (notStarted.length > 0) {
    groups.push({ id: 'not-started', rows: notStarted })
  }
  return groups
}
