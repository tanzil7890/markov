import React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import type { WorkspaceStatusDefinition } from '../../../../../../shared/worktree/types'
import SidebarFilter from '../../worktree-list/controls/SidebarFilter'
import WorkspaceKanbanSearchField from '../search/WorkspaceKanbanSearchField'
import WorkspaceKanbanSettingsMenu from './WorkspaceKanbanSettingsMenu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { hasCustomTitleBar } from '@/app-shell/app-window-chrome'

type WorkspaceKanbanDrawerHeaderProps = {
  selectedCount: number
  query: string
  isFiltering: boolean
  isTooLarge: boolean
  matchCount: number
  totalCount: number
  onQueryChange: (query: string) => void
  onClearQuery: () => void
  workspaceStatuses: readonly WorkspaceStatusDefinition[]
  syncTaskStatusFromWorkspaceBoard: boolean
  onSyncTaskStatusFromWorkspaceBoardChange: (enabled: boolean) => void
  onRenameStatus: (statusId: string, label: string) => void
  onChangeStatusColor: (statusId: string, color: string) => void
  onChangeStatusIcon: (statusId: string, icon: string) => void
  onMoveStatus: (statusId: string, direction: -1 | 1) => void
  onRemoveStatus: (statusId: string) => void
  onAddStatus: () => void
  onFilterMenuOpenChange: (open: boolean) => void
  onClose: () => void
}

export default function WorkspaceKanbanDrawerHeader({
  selectedCount,
  query,
  isFiltering,
  isTooLarge,
  matchCount,
  totalCount,
  onQueryChange,
  onClearQuery,
  workspaceStatuses,
  syncTaskStatusFromWorkspaceBoard,
  onSyncTaskStatusFromWorkspaceBoardChange,
  onRenameStatus,
  onChangeStatusColor,
  onChangeStatusIcon,
  onMoveStatus,
  onRemoveStatus,
  onAddStatus,
  onFilterMenuOpenChange,
  onClose
}: WorkspaceKanbanDrawerHeaderProps): React.JSX.Element {
  // Why: with the right sidebar closed this row reaches the window edge, under Windows/Linux window buttons.
  const rightSidebarOpen = useAppStore((state) => state.rightSidebarOpen)
  const controls = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={translate(
            'auto.components.sidebar.WorkspaceKanbanDrawerHeader.f369f5c5a3',
            'Close'
          )}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
        <span className="text-[13px] font-semibold text-foreground">
          {translate('auto.components.sidebar.SidebarToolbar.boardShort', 'Board')}
        </span>
        {selectedCount > 1 ? (
          <span className="rounded-full bg-worktree-sidebar-accent px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {translate(
              'auto.components.sidebar.WorkspaceKanbanDrawerHeader.selectedCount',
              '{{count}} selected',
              { count: selectedCount, defaultValue_one: '{{count}} selected' }
            )}
          </span>
        ) : null}
        <SidebarFilter
          preserveWorkspaceBoardOpen
          tooltipSide="bottom"
          contentSide="bottom"
          onMenuOpenChange={onFilterMenuOpenChange}
        />
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-1 [-webkit-app-region:no-drag]">
        <div className="w-56 min-w-0">
          <WorkspaceKanbanSearchField
            query={query}
            isFiltering={isFiltering}
            isTooLarge={isTooLarge}
            matchCount={matchCount}
            totalCount={totalCount}
            onQueryChange={onQueryChange}
            onClear={onClearQuery}
            onClose={onClose}
          />
        </div>
        <WorkspaceKanbanSettingsMenu
          workspaceStatuses={workspaceStatuses}
          syncTaskStatusFromWorkspaceBoard={syncTaskStatusFromWorkspaceBoard}
          onSyncTaskStatusFromWorkspaceBoardChange={onSyncTaskStatusFromWorkspaceBoardChange}
          onRenameStatus={onRenameStatus}
          onChangeStatusColor={onChangeStatusColor}
          onChangeStatusIcon={onChangeStatusIcon}
          onMoveStatus={onMoveStatus}
          onRemoveStatus={onRemoveStatus}
          onAddStatus={onAddStatus}
        />
      </div>
    </div>
  )

  return (
    <>
      {/* The sheet keeps its accessible name; the visible row shows a short label. */}
      <div className="sr-only">
        <SheetTitle>
          {translate(
            'auto.components.sidebar.WorkspaceKanbanDrawerHeader.c6a77ab0f4',
            'Workspace board'
          )}
        </SheetTitle>
        <SheetDescription>
          {translate(
            'auto.components.sidebar.WorkspaceKanbanDrawerHeader.e1a34450fc',
            'Organize workspaces by status and open workspace cards.'
          )}
        </SheetDescription>
      </div>
      {/* Why: the board covers the workspace tab strip, so this row is its title bar: same height, draggable. */}
      <div className="flex h-9 shrink-0 items-center border-b border-border px-2 [-webkit-app-region:drag]">
        {controls}
        {hasCustomTitleBar && !rightSidebarOpen ? (
          <div className="window-controls-titlebar-spacer" />
        ) : null}
      </div>
    </>
  )
}
