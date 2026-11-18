import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { findRightSidebarTabGroup } from '../../../../../shared/workspace-layout/right-sidebar-tab-group'
import type { Tab } from '../../../../../shared/tab-types'

const NO_TABS: readonly Tab[] = []

export function sidebarTerminalTabLabel(tab: Tab): string {
  return tab.customLabel?.trim() || tab.quickCommandLabel?.trim() || tab.label
}

/** The workspace's sidebar terminals in tab order, and the one the sidebar shows. */
export function useSidebarTerminalTabs(worktreeId: string): {
  tabs: readonly Tab[]
  activeTab: Tab | null
} {
  const { group, unifiedTabs } = useAppStore(
    useShallow((s) => ({
      group: findRightSidebarTabGroup(s.groupsByWorktree[worktreeId]),
      unifiedTabs: s.unifiedTabsByWorktree[worktreeId] ?? NO_TABS
    }))
  )
  return useMemo(() => {
    if (!group) {
      return { tabs: NO_TABS, activeTab: null }
    }
    const byId = new Map(unifiedTabs.map((tab) => [tab.id, tab]))
    const tabs = group.tabOrder.flatMap((id) => {
      const tab = byId.get(id)
      return tab && tab.contentType === 'terminal' ? [tab] : []
    })
    return { tabs, activeTab: tabs.find((tab) => tab.id === group.activeTabId) ?? tabs[0] ?? null }
  }, [group, unifiedTabs])
}
