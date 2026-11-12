import React from 'react'
import { Kanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

/** Board sits beside Tasks and shares its active fill: both are pages that replace the workspace view. */
export function SidebarBoardNavButton({
  open,
  dragPreviewOpen,
  onToggle
}: {
  open: boolean
  dragPreviewOpen: boolean
  onToggle: () => void
}): React.JSX.Element {
  const highlighted = open || dragPreviewOpen
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={translate('auto.components.sidebar.SidebarToolbar.49f62c5665', 'Workspace board')}
      aria-pressed={open}
      data-workspace-board-trigger=""
      data-workspace-board-preview={dragPreviewOpen ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        highlighted
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Kanban
        className={cn('size-4 shrink-0', !highlighted && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={highlighted ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.sidebar.SidebarToolbar.boardShort', 'Board')}
      </span>
    </button>
  )
}
