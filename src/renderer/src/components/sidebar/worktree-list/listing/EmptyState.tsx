import React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export function SidebarWorktreeListEmptyState({
  hasFilters,
  onClearFilters
}: {
  hasFilters: boolean
  onClearFilters: () => void
}): React.JSX.Element {
  const discoveryCompleted = useAppStore((s) => s.startupWorktreeRefreshCompleted)
  return (
    <div
      data-worktree-sidebar-container
      data-contextual-tour-target="workspace-list"
      className="relative min-h-0 flex-1"
    >
      <div className="worktree-sidebar-scrollbar flex h-full flex-col overflow-y-auto overflow-x-hidden pl-1 scrollbar-sleek pt-px">
        <div className="flex flex-col items-center gap-1 px-6 pt-9 text-center">
          {discoveryCompleted && (
            <span className="text-[13px] font-medium text-worktree-sidebar-foreground">
              {translate('auto.components.sidebar.WorktreeList.b7acbf038b', 'No workspaces found')}
            </span>
          )}
          {hasFilters && (
            <>
              <span className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.sidebar.WorktreeList.hiddenByFilters',
                  'Filters are hiding workspaces.'
                )}
              </span>
              <Button variant="outline" size="xs" onClick={onClearFilters} className="mt-2">
                {translate('auto.components.sidebar.WorktreeList.370c6a55dd', 'Show all')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
