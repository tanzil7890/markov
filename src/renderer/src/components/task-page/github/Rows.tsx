import React from 'react'
import type { TaskPageComposerActionsModel } from '../use-task-page-composer-actions'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { GITHUB_TASK_HEADER_SURFACE_CLASS } from '../task-page-source-context'
import { TaskPageGitHubTaskRow } from './TaskRow'
import { groupGitHubTaskRows, type GitHubTaskRowGroupId } from './task-page-github-row-groups'

function groupLabel(id: GitHubTaskRowGroupId): string | null {
  switch (id) {
    case 'in-workspace':
      return translate('auto.components.TaskPage.groupInWorkspace', 'In a workspace')
    case 'not-started':
      return translate('auto.components.TaskPage.groupNotStarted', 'Not started')
    case 'all':
      return null
  }
}

export function TaskPageGitHubRows({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element | null {
  const { allWorktrees, filteredWorkItems, showGitHubTaskSkeletons, githubTaskGridClass } = model
  const groups = showGitHubTaskSkeletons ? [] : groupGitHubTaskRows(filteredWorkItems, allWorktrees)
  return (
    <div className="divide-y divide-border/40">
      {groups.map((group) => {
        const label = groupLabel(group.id)
        return (
          <React.Fragment key={group.id}>
            {label ? (
              <h2
                data-github-task-group={group.id}
                className={cn(
                  'grid h-8 items-center px-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground',
                  GITHUB_TASK_HEADER_SURFACE_CLASS,
                  githubTaskGridClass
                )}
              >
                <span className="sticky left-3 col-span-full flex items-center gap-1.5 justify-self-start">
                  {label}
                  <span className="font-normal tabular-nums">{group.rows.length}</span>
                </span>
              </h2>
            ) : null}
            {group.rows.map(({ item, attachedWorkspace }) => (
              <TaskPageGitHubTaskRow
                // Scope React keys by repo, host and item because twins and shared upstreams repeat item IDs.
                key={`${item.repoId}:${item.repoHostId ?? ''}:${item.id}`}
                model={model}
                item={item}
                attachedWorkspace={attachedWorkspace}
              />
            ))}
          </React.Fragment>
        )
      })}
    </div>
  )
}
