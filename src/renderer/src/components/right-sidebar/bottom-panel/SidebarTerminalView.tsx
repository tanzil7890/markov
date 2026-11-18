import { useEffect, useLayoutEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { setTerminalPortalTargets } from '@/components/activity/activity-terminal-portal'
import {
  createSidebarTerminal,
  hasSeededSidebarTerminal,
  markSidebarTerminalSeeded
} from './sidebar-terminal-tabs'
import { useSidebarTerminalTabs } from './use-sidebar-terminal-tabs'

const SLOT_ID = 'right-sidebar-terminal'

/** The open sidebar terminal; the first one opens on the first look, the header row adds more. */
export function SidebarTerminalView({
  worktreeId,
  visible
}: {
  worktreeId: string
  visible: boolean
}): React.JSX.Element {
  const { tabs, activeTab } = useSidebarTerminalTabs(worktreeId)
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)
  // Restoring the saved session replaces the tab model; a terminal made before it would be lost.
  const sessionRestored = useAppStore((s) => s.workspaceSessionReady && s.hydrationSucceeded)

  // The first look at a workspace's sidebar opens its terminal; closing them all later stays closed.
  useEffect(() => {
    if (!visible || !sessionRestored || tabs.length > 0 || hasSeededSidebarTerminal(worktreeId)) {
      return
    }
    markSidebarTerminalSeeded(worktreeId)
    createSidebarTerminal(worktreeId)
  }, [sessionRestored, tabs.length, visible, worktreeId])

  // Publish before paint so the pane never flashes in the main area's slot.
  useLayoutEffect(() => {
    setTerminalPortalTargets(
      'right-sidebar',
      visible && slot && activeTab
        ? [
            {
              slotId: SLOT_ID,
              requestToken: `${SLOT_ID}:${activeTab.entityId}`,
              target: slot,
              worktreeId,
              tabId: activeTab.entityId,
              paneKey: null,
              active: true
            }
          ]
        : []
    )
  }, [activeTab, slot, visible, worktreeId])
  useEffect(() => () => setTerminalPortalTargets('right-sidebar', []), [])

  if (tabs.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 pb-6 text-center">
        <p className="text-xs text-muted-foreground">
          {translate('auto.components.right.sidebar.terminal.none', 'No terminal open')}
        </p>
        <Button size="sm" variant="outline" onClick={() => createSidebarTerminal(worktreeId)}>
          <Plus className="size-3.5" />
          {translate('auto.components.right.sidebar.terminal.new', 'New terminal')}
        </Button>
      </div>
    )
  }

  return (
    <div
      ref={setSlot}
      data-right-sidebar-terminal-slot
      className="relative mx-2 mb-2 flex min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-background"
    />
  )
}
