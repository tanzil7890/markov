import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { layoutHoldsRightSidebarGroup } from '../../../../../shared/workspace-layout/right-sidebar-tab-group'
import { SidebarBottomTabStrip } from './SidebarBottomTabStrip'
import { SidebarCommandsView } from './SidebarCommandsView'
import { SidebarTerminalView } from './SidebarTerminalView'
import { useRightSidebarBottomPanel } from './right-sidebar-bottom-panel-state'

/** The sidebar's lower half: the workspace's saved commands, or one of its terminals. */
export function RightSidebarBottomPanel({
  worktreeId,
  visible
}: {
  worktreeId: string
  /** False while the sidebar is closed; the terminal must not claim a zero-size slot. */
  visible: boolean
}): React.JSX.Element {
  const view = useRightSidebarBottomPanel((s) => s.view)
  const folded = useRightSidebarBottomPanel((s) => s.folded)
  const workspaceShown = useAppStore((s) => s.activeView === 'terminal')
  const layoutShowsSidebarGroup = useAppStore((s) =>
    layoutHoldsRightSidebarGroup(s.layoutByWorktree[worktreeId], worktreeId)
  )
  // Repair, never expected: the main area must not draw the sidebar's terminals.
  useEffect(() => {
    if (layoutShowsSidebarGroup) {
      useAppStore.getState().reconcileWorktreeTabModel(worktreeId)
    }
  }, [layoutShowsSidebarGroup, worktreeId])

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-right-sidebar-bottom-panel>
      <SidebarBottomTabStrip worktreeId={worktreeId} />
      {folded ? null : view === 'commands' ? (
        <SidebarCommandsView worktreeId={worktreeId} />
      ) : (
        <SidebarTerminalView worktreeId={worktreeId} visible={visible && workspaceShown} />
      )}
    </div>
  )
}
