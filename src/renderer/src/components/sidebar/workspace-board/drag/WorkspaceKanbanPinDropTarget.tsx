import React from 'react'
import { Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type WorkspaceKanbanPinDropTargetProps = {
  isDragOver: boolean
  onDragOver: (event: React.DragEvent) => void
  onDragLeave: (event: React.DragEvent) => void
}

export default function WorkspaceKanbanPinDropTarget({
  isDragOver,
  onDragOver,
  onDragLeave
}: WorkspaceKanbanPinDropTargetProps): React.JSX.Element {
  return (
    <div
      data-workspace-pin-drop-target=""
      className={cn(
        // Why: a drop zone, not content; it stays quiet until something is dragged over it.
        'mb-2 flex h-7 shrink-0 items-center gap-2 rounded-md border border-transparent px-2 text-[12px] text-muted-foreground transition-colors',
        isDragOver && 'border-worktree-sidebar-ring bg-worktree-sidebar-accent text-foreground',
        'data-[workspace-board-external-drag-target=true]:border-worktree-sidebar-ring data-[workspace-board-external-drag-target=true]:bg-worktree-sidebar-accent data-[workspace-board-external-drag-target=true]:text-foreground'
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <Pin className="size-3.5" />
      <span className="font-medium">
        {translate('auto.components.sidebar.WorkspaceKanbanPinDropTarget.8fae2d0862', 'Pinned')}
      </span>
      <span className="truncate">
        {translate(
          'auto.components.sidebar.WorkspaceKanbanPinDropTarget.c30151c5ee',
          'Drop here to pin without changing status.'
        )}
      </span>
    </div>
  )
}
