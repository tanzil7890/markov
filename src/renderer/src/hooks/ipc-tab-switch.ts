import { useAppStore } from '../store'
import { getActiveTabNavOrder } from '@/components/tab-bar/group-tab-order'
import {
  getActiveEntityIdForTabType,
  getNextTerminalCycleTab,
  isTerminalCycleType,
  getNextTabAcrossAllTypes,
  getNextTabWithinActiveType,
  getPreviousRecentTab,
  type TypeCyclableTab
} from '@/components/terminal/tab-type-cycle'
import { activateCycledTabOnOwner } from '@/lib/cycled-tab-owner-activation'
import {
  SETTINGS_TAB_ID,
  isSettingsTabPrevious,
  selectCyclableSettingsTab,
  selectFocusedSettingsTabWorktreeId,
  settingsTabInsertIndex
} from '@/lib/settings-tab-placement'
import {
  getWorktreeTerminalTabOrder,
  shouldUseWorktreeTerminalFallback
} from './terminal-cycle-hydration-fallback'

type AppStoreState = ReturnType<typeof useAppStore.getState>

type CycleContext = {
  store: AppStoreState
  worktreeId: string
  allTabIds: TypeCyclableTab[]
  groupTabIdInNav: string | null
}

const SETTINGS_CYCLE_TAB: TypeCyclableTab = {
  type: 'settings',
  id: SETTINGS_TAB_ID,
  tabId: SETTINGS_TAB_ID
}

/** Resolve active workspace/nav for either cycle action; null means nothing to cycle.
 *  `withSettingsTab` adds the Settings tab where the strip draws it, for cycles across every type. */
function resolveCycleContext(options?: { withSettingsTab?: boolean }): CycleContext | null {
  const store = useAppStore.getState()
  const worktreeId = store.activeWorktreeId
  if (!worktreeId) {
    return null
  }
  // Cycle the visible group’s order so keyboard navigation follows dragged tabs.
  const allTabIds: TypeCyclableTab[] = getActiveTabNavOrder(store, worktreeId)
  const settings = options?.withSettingsTab ? selectCyclableSettingsTab(store, worktreeId) : null
  if (settings) {
    allTabIds.splice(
      settingsTabInsertIndex(
        allTabIds.map((entry) => entry.tabId ?? entry.id),
        settings.tab.leftTabIds
      ),
      0,
      SETTINGS_CYCLE_TAB
    )
  }
  if (allTabIds.length <= 1) {
    return null
  }
  if (settings?.shown) {
    return { store, worktreeId, allTabIds, groupTabIdInNav: SETTINGS_TAB_ID }
  }
  const activeGroupId = store.activeGroupIdByWorktree[worktreeId]
  const group = activeGroupId
    ? (store.groupsByWorktree[worktreeId] ?? []).find((candidate) => candidate.id === activeGroupId)
    : undefined
  // Prefer exact unified tab IDs for split copies; fall back to backing IDs only without a valid group selection, keeping ID domains separate.
  const groupTabIdInNav =
    group?.activeTabId && allTabIds.some((entry) => entry.tabId === group.activeTabId)
      ? group.activeTabId
      : null
  return { store, worktreeId, allTabIds, groupTabIdInNav }
}

/** Activate by unified tab ID after file/browser updates so duplicate entities focus the correct split instance. */
export function activateCyclableTab(store: AppStoreState, next: TypeCyclableTab): void {
  const worktreeId = store.activeWorktreeId
  if (next.type === 'settings') {
    if (worktreeId) {
      store.showSettingsTab(worktreeId)
    }
    return
  }
  if (next.type === 'terminal') {
    store.setActiveTab(next.id)
    // Legacy terminal entity activation can choose another split copy; finish with exact unified ID.
    if (next.tabId) {
      store.activateTab?.(next.tabId)
    }
    store.setActiveTabType('terminal', worktreeId)
  } else if (next.type === 'browser') {
    store.setActiveBrowserTab(next.id)
    if (next.tabId) {
      store.activateTab?.(next.tabId)
    }
    store.setActiveTabType('browser', worktreeId)
  } else if (next.type === 'simulator') {
    store.setActiveTab(next.tabId ?? next.id)
    if (next.tabId) {
      store.activateTab?.(next.tabId)
    }
    store.setActiveTabType('simulator', worktreeId)
  } else if (next.type === 'agent-session') {
    if (next.tabId) {
      store.activateTab?.(next.tabId)
    }
    store.setActiveTabType('agent-session', worktreeId)
  } else {
    // setActiveFile selects the entity; activateTab disambiguates its split copy.
    store.setActiveFile(next.id)
    if (next.tabId) {
      store.activateTab?.(next.tabId)
    }
    store.setActiveTabType('editor', worktreeId)
  }
  activateCycledTabOnOwner(worktreeId, next)
}

/** Cycle the current type. Fresh installs use Cmd/Ctrl+Alt+[ / ]; migrated bindings may retain the inverse and remain rebindable. */
export function handleSwitchTab(direction: number): boolean {
  // Why: Settings is the only tab of its type, so there is no next one; the tab under it must not move.
  if (selectFocusedSettingsTabWorktreeId(useAppStore.getState())) {
    return true
  }
  const ctx = resolveCycleContext()
  if (!ctx) {
    return false
  }
  const { store, allTabIds, groupTabIdInNav } = ctx
  const next = getNextTabWithinActiveType({
    tabs: allTabIds,
    activeTabType: store.activeTabType,
    activeTabId: store.activeTabId,
    activeFileId: store.activeFileId,
    activeBrowserTabId: store.activeBrowserTabId,
    activeGroupTabId: groupTabIdInNav,
    direction
  })
  if (!next) {
    return false
  }
  activateCyclableTab(store, next)
  return true
}

/** Cycle all visible types. Fresh installs use Cmd/Ctrl+Shift+[ / ]; migrated bindings may retain the inverse and remain rebindable. */
export function handleSwitchTabAcrossAllTypes(direction: number): boolean {
  const ctx = resolveCycleContext({ withSettingsTab: true })
  if (!ctx) {
    return false
  }
  const { store, allTabIds, groupTabIdInNav } = ctx
  const next = getNextTabAcrossAllTypes({
    tabs: allTabIds,
    activeTabType: store.activeTabType,
    activeTabId: store.activeTabId,
    activeFileId: store.activeFileId,
    activeBrowserTabId: store.activeBrowserTabId,
    activeGroupTabId: groupTabIdInNav,
    direction
  })
  if (!next) {
    return false
  }
  activateCyclableTab(store, next)
  return true
}

/** Ctrl+Tab quick-toggles MRU across visible types in the active group. */
export function handleSwitchRecentTab(): boolean {
  const ctx = resolveCycleContext({ withSettingsTab: true })
  if (!ctx) {
    return false
  }
  const { store, worktreeId, allTabIds, groupTabIdInNav } = ctx
  const groupId = store.activeGroupIdByWorktree[worktreeId]
  const group = groupId
    ? (store.groupsByWorktree[worktreeId] ?? []).find((candidate) => candidate.id === groupId)
    : undefined
  const layoutTabs = allTabIds.filter((entry) => entry.type !== 'settings')
  if (groupTabIdInNav === SETTINGS_TAB_ID) {
    // From Settings, the previous tab is the one it covers.
    const covered = layoutTabs.find((entry) => entry.tabId === group?.activeTabId)
    if (!covered) {
      return false
    }
    activateCyclableTab(store, covered)
    return true
  }
  if (selectCyclableSettingsTab(store, worktreeId) && isSettingsTabPrevious(store, worktreeId)) {
    activateCyclableTab(store, SETTINGS_CYCLE_TAB)
    return true
  }
  const next = getPreviousRecentTab(layoutTabs, group?.recentTabIds, groupTabIdInNav)
  if (!next) {
    return false
  }

  activateCyclableTab(store, next)
  return true
}

/** Ctrl+PageUp/PageDown cycle terminals and native chats in visible order. */
export function handleSwitchTerminalTab(direction: number): boolean {
  const store = useAppStore.getState()
  const worktreeId = store.activeWorktreeId
  if (!worktreeId) {
    return false
  }
  // Keep terminal hydration detection separate: native chats are self-backed.
  const activeGroupNavTabs = getActiveTabNavOrder(store, worktreeId)
  const activeGroupTerminalTabs = activeGroupNavTabs.filter((entry) => entry.type === 'terminal')
  const worktreeTerminalTabs = getWorktreeTerminalTabOrder(store, worktreeId)
  const useFallback = shouldUseWorktreeTerminalFallback(
    store,
    worktreeId,
    activeGroupNavTabs,
    activeGroupTerminalTabs,
    worktreeTerminalTabs
  )
  const cycleTabs: TypeCyclableTab[] = activeGroupNavTabs.filter((entry) =>
    isTerminalCycleType(entry.type)
  )
  if (useFallback) {
    const visibleTerminalIds = new Set(activeGroupTerminalTabs.map((tab) => tab.id))
    cycleTabs.push(...worktreeTerminalTabs.filter((tab) => !visibleTerminalIds.has(tab.id)))
  }
  // Prefiltered terminal navigation must use the active entity’s domain, never a stale background terminal ID under structured focus.
  const activeTab = store.getActiveTab(worktreeId)
  const currentId = getActiveEntityIdForTabType(
    store.activeTabType,
    store.activeTabId,
    store.activeFileId,
    store.activeBrowserTabId,
    activeTab?.contentType === 'agent-session' ? activeTab.entityId : null
  )
  const next = getNextTerminalCycleTab(
    cycleTabs,
    {
      type: store.activeTabType,
      id: currentId ?? '',
      // A runtime-only selection leaves the previous unified group selection behind.
      tabId:
        activeTab?.contentType === store.activeTabType && activeTab.entityId === currentId
          ? activeTab.id
          : undefined
    },
    direction
  )
  if (!next) {
    return false
  }
  activateCyclableTab(store, next)
  return true
}
