import React from 'react'
import { cn } from '@/lib/utils'
import { getWorktreeStatusLabel } from '@/lib/worktree-status'
import StatusIndicator from '@/components/sidebar/workspace-card/surface/StatusIndicator'
import { useWorktreeActivityStatus } from '@/components/sidebar/workspace-card/activity/use-worktree-activity-status'

/** The workspace a task was started in, with what its agent is doing right now. */
export function TaskRowWorkspaceStatus({
  worktreeId,
  label
}: {
  worktreeId: string
  label: string
}): React.JSX.Element {
  const status = useWorktreeActivityStatus(worktreeId)
  // Why: an idle workspace has nothing to report beyond its name.
  const showStatusLabel = status !== 'inactive' && status !== 'active'
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5"
      data-task-row-workspace-status={status}
    >
      <StatusIndicator status={status} showTooltip={false} aria-hidden="true" />
      <span className="truncate">{label}</span>
      {showStatusLabel ? (
        <span
          className={cn(
            'shrink-0',
            status === 'permission' && 'font-medium text-agent-question-text'
          )}
        >
          · {getWorktreeStatusLabel(status)}
        </span>
      ) : null}
    </span>
  )
}
