import React from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { isWorkspaceBoardKeepOpenTarget } from './use-workspace-kanban-outside-dismiss'
import {
  STATUS_BAR_RESERVE_HEIGHT,
  WORKSPACE_TOP_CHROME_HEIGHT
} from '../../workspace-chrome-metrics'
import { trackSidebarLiveWidth } from '../../sidebar-live-width'
import { useWorkspaceColumnRect } from './use-workspace-column-rect'

type WorkspaceKanbanSheetProps = {
  boardRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
  dragPreview: boolean
  leftSidebarStyle?: React.CSSProperties
  onOpenChange: (open: boolean) => void
  open: boolean
  preserveOpenForMenu: boolean
  sidebarOpen: boolean
  sidebarWidth: number
  statusBarVisible: boolean
}

export default function WorkspaceKanbanSheet({
  boardRef,
  children,
  dragPreview,
  leftSidebarStyle,
  onOpenChange,
  open,
  preserveOpenForMenu,
  sidebarOpen,
  sidebarWidth,
  statusBarVisible
}: WorkspaceKanbanSheetProps): React.JSX.Element {
  const drawerLeft = sidebarOpen ? sidebarWidth : 0
  const drawerLeftCss = sidebarOpen
    ? `var(--workspace-sidebar-live-width, ${sidebarWidth}px)`
    : '0px'
  const drawerBottom = `${statusBarVisible ? STATUS_BAR_RESERVE_HEIGHT : 0}px`
  // Why: the board is a page, so it replaces the whole workspace column, tab strip included, and stops at the right sidebar.
  const columnRect = useWorkspaceColumnRect(open)
  const placement = columnRect
    ? {
        left: `${columnRect.left}px`,
        top: columnRect.top,
        bottom: 'auto',
        height: `${columnRect.height}px`,
        width: `${columnRect.width}px`
      }
    : {
        left: drawerLeftCss,
        top: WORKSPACE_TOP_CHROME_HEIGHT,
        bottom: drawerBottom,
        height: 'auto',
        width: `min(calc(100vw - ${drawerLeftCss}), 1294px)`
      }
  const sheetStyle: React.CSSProperties = { ...leftSidebarStyle, ...placement }
  const keepOpenForOutsideEvent = (event: {
    preventDefault: () => void
    detail: { originalEvent: Event }
  }): void => {
    const originalEvent = event.detail.originalEvent
    const target = originalEvent.target
    if (preserveOpenForMenu || isWorkspaceBoardKeepOpenTarget(target)) {
      event.preventDefault()
      return
    }
    const liveDrawerLeft =
      boardRef.current?.closest<HTMLElement>('[data-slot="sheet-content"]')?.getBoundingClientRect()
        .left ?? drawerLeft
    const pointerX =
      'clientX' in originalEvent && typeof originalEvent.clientX === 'number'
        ? originalEvent.clientX
        : null
    if (pointerX !== null && pointerX < liveDrawerLeft) {
      event.preventDefault()
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true)
        }
      }}
      modal={false}
    >
      <SheetContent
        side="left"
        showCloseButton={false}
        ref={trackSidebarLiveWidth}
        className="workspace-kanban-sheet-content bg-worktree-sidebar p-0 sm:max-w-none"
        overlayStyle={{
          top: placement.top,
          bottom: placement.bottom,
          left: placement.left,
          height: placement.height,
          pointerEvents: 'none'
        }}
        style={sheetStyle}
        data-contextual-tour-target="workspace-board-surface"
        data-workspace-board-sheet=""
        data-workspace-board-drag-preview={dragPreview ? 'true' : undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={keepOpenForOutsideEvent}
        onInteractOutside={keepOpenForOutsideEvent}
      >
        {children}
      </SheetContent>
    </Sheet>
  )
}
