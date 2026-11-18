import type { useAppStore } from '../store'
import type { TypeCyclableTab } from '@/components/terminal/tab-type-cycle'

type AppStoreState = ReturnType<typeof useAppStore.getState>

/** Build a stable worktree-wide terminal order for a temporarily incomplete group projection. */
export function getWorktreeTerminalTabOrder(
  store: AppStoreState,
  worktreeId: string
): TypeCyclableTab[] {
  const runtimeTabs = store.tabsByWorktree?.[worktreeId] ?? []
  const unifiedTerminalTabs = (store.unifiedTabsByWorktree?.[worktreeId] ?? []).filter(
    (tab) => tab.contentType === 'terminal'
  )
  const activeGroupId = store.activeGroupIdByWorktree?.[worktreeId]
  const unifiedByEntity = new Map<string, typeof unifiedTerminalTabs>()
  for (const tab of unifiedTerminalTabs) {
    const existing = unifiedByEntity.get(tab.entityId)
    if (existing) {
      existing.push(tab)
    } else {
      unifiedByEntity.set(tab.entityId, [tab])
    }
  }

  const resolveTabId = (entityId: string): string | undefined => {
    const matches = unifiedByEntity.get(entityId) ?? []
    // Keep split activation exact when the active group has one unambiguous copy.
    const activeGroupMatch = activeGroupId
      ? matches.filter((tab) => tab.groupId === activeGroupId)
      : []
    if (activeGroupMatch.length === 1) {
      return activeGroupMatch[0].id
    }
    return matches.length === 1 ? matches[0].id : undefined
  }

  const result: TypeCyclableTab[] = []
  const seenEntityIds = new Set<string>()
  for (const tab of runtimeTabs) {
    if (seenEntityIds.has(tab.id)) {
      continue
    }
    seenEntityIds.add(tab.id)
    const tabId = resolveTabId(tab.id)
    result.push({ type: 'terminal', id: tab.id, ...(tabId ? { tabId } : {}) })
  }
  // Unified rows can arrive before their legacy runtime rows during hydration.
  for (const tab of unifiedTerminalTabs) {
    if (seenEntityIds.has(tab.entityId)) {
      continue
    }
    seenEntityIds.add(tab.entityId)
    result.push({ type: 'terminal', id: tab.entityId, tabId: tab.id })
  }
  return result
}

/** Return true only when a short active-group list is attributable to stale hydration. */
export function shouldUseWorktreeTerminalFallback(
  store: AppStoreState,
  worktreeId: string,
  activeGroupNavTabs: readonly TypeCyclableTab[],
  activeGroupTerminalTabs: readonly TypeCyclableTab[],
  worktreeTerminalTabs: readonly TypeCyclableTab[]
): boolean {
  if (
    activeGroupTerminalTabs.length >= 2 ||
    worktreeTerminalTabs.length <= activeGroupTerminalTabs.length
  ) {
    return false
  }
  const groups = store.groupsByWorktree?.[worktreeId] ?? []
  const activeGroupId = store.activeGroupIdByWorktree?.[worktreeId]
  const activeGroup = activeGroupId ? groups.find((group) => group.id === activeGroupId) : undefined
  if (!activeGroup) {
    return true
  }

  const unifiedTerminalTabs = (store.unifiedTabsByWorktree?.[worktreeId] ?? []).filter(
    (tab) => tab.contentType === 'terminal'
  )
  if (unifiedTerminalTabs.length === 0) {
    return true
  }
  const allUnifiedEntityIds = new Set(unifiedTerminalTabs.map((tab) => tab.entityId))
  const runtimeIdsMissingFromUnified = worktreeTerminalTabs.some(
    (tab) => !allUnifiedEntityIds.has(tab.id)
  )
  if (runtimeIdsMissingFromUnified) {
    return true
  }

  // Only empty group projection proves hydration gaps; do not cross splits whose populated editor/browser rows intentionally exclude terminals.
  const hasPopulatedNonterminalRows = activeGroupNavTabs.some((tab) => tab.type !== 'terminal')
  const groupTerminalTabs = unifiedTerminalTabs.filter((tab) => tab.groupId === activeGroup.id)
  const visibleTerminalEntityIds = new Set(activeGroupTerminalTabs.map((tab) => tab.id))
  if (groupTerminalTabs.some((tab) => !visibleTerminalEntityIds.has(tab.entityId))) {
    return true
  }
  if (activeGroupTerminalTabs.length === 0 && hasPopulatedNonterminalRows) {
    return groupTerminalTabs.length > 0
  }

  // One group can recover absent runtime rows as hydration gaps; multiple one-terminal groups intentionally no-op.
  const declaredGroupTabIds = new Set(activeGroup.tabOrder ?? [])
  if (groupTerminalTabs.some((tab) => !declaredGroupTabIds.has(tab.id))) {
    return true
  }
  if (groups.length <= 1) {
    const activeGroupEntityIds = new Set(groupTerminalTabs.map((tab) => tab.entityId))
    if (worktreeTerminalTabs.some((tab) => !activeGroupEntityIds.has(tab.id))) {
      return true
    }
  }

  if (activeGroup.activeTabId) {
    const activeTab = (store.unifiedTabsByWorktree?.[worktreeId] ?? []).find(
      (tab) => tab.id === activeGroup.activeTabId
    )
    if (!activeTab || activeTab.groupId !== activeGroup.id) {
      return true
    }
  }
  return false
}
