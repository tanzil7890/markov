import type { AppState } from '@/store/types'
import type { TabGroup } from '../../../shared/tab-types'
import { selectWorktreeCreationSurfaceShown } from '@/lib/workspace/creation/worktree-creation-surface'

/** The Settings tab's id in a strip, in drags and in tab cycling. Never a layout tab id. */
export const SETTINGS_TAB_ID = 'settings-tab'

/** A workspace's Settings tab. Renderer-only: it is not a layout tab, so it is never saved with
 *  the workspace or mirrored to other clients and hosts. This window keeps it instead. */
export type SettingsTab = {
  groupId: string
  /** The tab the group had active when Settings was picked; Settings shows until the group moves off it. */
  shownOver: { tabId: string | null } | null
  /** The layout tabs on its left when it was last placed; it sits after the last one still there. */
  leftTabIds: readonly string[]
  isPinned: boolean
  /** The layout tab that took the screen from it, while that tab still shows: Settings is then the
   *  group's previous tab. Layout tabs keep that order in the group; Settings keeps its own. */
  leftForTabId: string | null
  /** When it was last picked. */
  lastShownAt: number
}

export type SettingsTabsByWorktree = Record<string, SettingsTab>

type PlacementState = Pick<AppState, 'settingsTabsByWorktree' | 'groupsByWorktree'>

const EMPTY_GROUPS: readonly TabGroup[] = []

export function settingsTabOf(state: PlacementState, worktreeId: string): SettingsTab | null {
  return state.settingsTabsByWorktree?.[worktreeId] ?? null
}

/** The group that holds the tab: its own, or the workspace's first once that one closed. */
export function resolveSettingsTabGroup(
  state: PlacementState,
  worktreeId: string
): TabGroup | null {
  const tab = settingsTabOf(state, worktreeId)
  if (!tab) {
    return null
  }
  const groups = state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS
  return groups.find((group) => group.id === tab.groupId) ?? groups[0] ?? null
}

/** Whether Settings is the tab its group shows, rather than a tab waiting in the strip. */
export function isSettingsTabShown(state: PlacementState, worktreeId: string): boolean {
  const shownOver = settingsTabOf(state, worktreeId)?.shownOver
  const group = resolveSettingsTabGroup(state, worktreeId)
  return shownOver != null && group !== null && (group.activeTabId ?? null) === shownOver.tabId
}

export type SettingsTabStrip = Pick<SettingsTab, 'leftTabIds' | 'isPinned'> & { shown: boolean }

/** What one group's strip draws for the Settings tab; null when the tab is not in that group. */
export function selectSettingsTabStrip(
  state: PlacementState,
  worktreeId: string,
  groupId: string
): SettingsTabStrip | null {
  const tab = settingsTabOf(state, worktreeId)
  if (!tab || resolveSettingsTabGroup(state, worktreeId)?.id !== groupId) {
    return null
  }
  return {
    shown: isSettingsTabShown(state, worktreeId),
    leftTabIds: tab.leftTabIds,
    isPinned: tab.isPinned
  }
}

/** Whether Settings covers this group's pane, so the tab under it must not take focus or keys. */
export function selectSettingsTabCoversGroup(state: PlacementState, groupId: string): boolean {
  for (const worktreeId of Object.keys(state.settingsTabsByWorktree ?? {})) {
    if (resolveSettingsTabGroup(state, worktreeId)?.id === groupId) {
      return isSettingsTabShown(state, worktreeId)
    }
  }
  return false
}

type FocusState = PlacementState &
  Pick<AppState, 'activeView' | 'activeWorktreeId' | 'activeGroupIdByWorktree'>

/** The workspace whose Settings tab the user is on (shown, in the focused group), else null. */
export function selectFocusedSettingsTabWorktreeId(state: FocusState): string | null {
  const worktreeId = state.activeWorktreeId
  if (
    !worktreeId ||
    state.activeView !== 'terminal' ||
    !isSettingsTabShown(state, worktreeId) ||
    resolveSettingsTabGroup(state, worktreeId)?.id !== state.activeGroupIdByWorktree[worktreeId]
  ) {
    return null
  }
  return worktreeId
}

/** The Settings tab as tab cycling sees it: present only in the workspace's focused group. */
export function selectCyclableSettingsTab(
  state: PlacementState & Pick<AppState, 'activeGroupIdByWorktree'>,
  worktreeId: string
): { tab: SettingsTab; shown: boolean } | null {
  const tab = settingsTabOf(state, worktreeId)
  if (
    !tab ||
    resolveSettingsTabGroup(state, worktreeId)?.id !== state.activeGroupIdByWorktree[worktreeId]
  ) {
    return null
  }
  return { tab, shown: isSettingsTabShown(state, worktreeId) }
}

/** Where Settings sits among a group's layout tabs: after the last of `leftTabIds` still present. */
export function settingsTabInsertIndex(
  orderedTabIds: readonly string[],
  leftTabIds: readonly string[]
): number {
  for (let index = leftTabIds.length - 1; index >= 0; index -= 1) {
    const position = orderedTabIds.indexOf(leftTabIds[index]!)
    if (position !== -1) {
      return position + 1
    }
  }
  return 0
}

/** A group's tab order as the strip draws it, the Settings tab included when it lives there. */
export function visualTabOrder(
  state: PlacementState,
  worktreeId: string,
  group: Pick<TabGroup, 'id' | 'tabOrder'>
): string[] {
  const tab = settingsTabOf(state, worktreeId)
  const order = [...group.tabOrder]
  if (tab && resolveSettingsTabGroup(state, worktreeId)?.id === group.id) {
    order.splice(settingsTabInsertIndex(order, tab.leftTabIds), 0, SETTINGS_TAB_ID)
  }
  return order
}

function withSettingsTab(
  state: PlacementState,
  worktreeId: string,
  tab: SettingsTab
): Pick<AppState, 'settingsTabsByWorktree'> {
  return { settingsTabsByWorktree: { ...state.settingsTabsByWorktree, [worktreeId]: tab } }
}

/** Opens the workspace's Settings tab in `groupId`, or brings the open one forward where it is. */
export function settingsTabsWithTabShown(
  state: PlacementState,
  worktreeId: string,
  groupId: string,
  now: number
): Pick<AppState, 'settingsTabsByWorktree'> | null {
  const existing = settingsTabOf(state, worktreeId)
  const group = existing
    ? resolveSettingsTabGroup(state, worktreeId)
    : (state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS).find((entry) => entry.id === groupId)
  if (!group) {
    return null
  }
  return withSettingsTab(state, worktreeId, {
    groupId: group.id,
    shownOver: { tabId: group.activeTabId ?? null },
    // A new tab opens at the end of the strip, like any other.
    leftTabIds: existing?.leftTabIds ?? group.tabOrder,
    isPinned: existing?.isPinned ?? false,
    leftForTabId: null,
    lastShownAt: now
  })
}

/** Places the tab from a drop: `visualOrder` is the target group's order with SETTINGS_TAB_ID in it. */
export function settingsTabsWithTabPlaced(
  state: PlacementState,
  worktreeId: string,
  groupId: string,
  visualOrder: readonly string[]
): Pick<AppState, 'settingsTabsByWorktree'> | null {
  const tab = settingsTabOf(state, worktreeId)
  const group = (state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS).find(
    (entry) => entry.id === groupId
  )
  const index = visualOrder.indexOf(SETTINGS_TAB_ID)
  if (!tab || !group || index === -1) {
    return null
  }
  const changedGroup = resolveSettingsTabGroup(state, worktreeId)?.id !== groupId
  return withSettingsTab(state, worktreeId, {
    ...tab,
    groupId,
    leftTabIds: visualOrder.slice(0, index),
    // Why: a tab dropped into another group becomes that group's tab on screen, as layout tabs do.
    shownOver: changedGroup ? { tabId: group.activeTabId ?? null } : tab.shownOver,
    leftForTabId: changedGroup ? null : tab.leftForTabId
  })
}

export function settingsTabsWithout(
  state: PlacementState,
  worktreeId: string
): Pick<AppState, 'settingsTabsByWorktree'> | null {
  if (!settingsTabOf(state, worktreeId)) {
    return null
  }
  const { [worktreeId]: _closed, ...rest } = state.settingsTabsByWorktree
  return { settingsTabsByWorktree: rest }
}

export function settingsTabsWithPinned(
  state: PlacementState,
  worktreeId: string,
  isPinned: boolean
): Pick<AppState, 'settingsTabsByWorktree'> | null {
  const tab = settingsTabOf(state, worktreeId)
  return tab && tab.isPinned !== isPinned
    ? withSettingsTab(state, worktreeId, { ...tab, isPinned })
    : null
}

/** Picking a tab of the group Settings covers puts Settings back in the strip. Needed on top of
 *  `shownOver` because picking the covered tab itself leaves the group's active tab unchanged. */
export function settingsTabsAfterTabPick(
  state: PlacementState,
  worktreeId: string,
  groupId: string,
  pickedTabId: string
): Pick<AppState, 'settingsTabsByWorktree'> | null {
  const tab = settingsTabOf(state, worktreeId)
  if (!tab?.shownOver || resolveSettingsTabGroup(state, worktreeId)?.id !== groupId) {
    return null
  }
  return withSettingsTab(state, worktreeId, { ...tab, shownOver: null, leftForTabId: pickedTabId })
}

function settingsTabAfterGroupChange(tab: SettingsTab, group: TabGroup): SettingsTab {
  const activeTabId = group.activeTabId ?? null
  if (tab.shownOver) {
    const coveredTabId = tab.shownOver.tabId
    if (activeTabId === coveredTabId) {
      return tab
    }
    // Closing the tab Settings covers must not uncover the next one: Settings stays.
    if (coveredTabId !== null && !group.tabOrder.includes(coveredTabId)) {
      return { ...tab, shownOver: { tabId: activeTabId } }
    }
    // Any other tab taking the screen (a new tab, one an agent opened) puts Settings in the strip.
    return activeTabId === null ? tab : { ...tab, shownOver: null, leftForTabId: activeTabId }
  }
  if (tab.leftForTabId === null) {
    return tab
  }
  // Closing the tab that replaced Settings returns to Settings, as closing a tab returns to the last one.
  if (!group.tabOrder.includes(tab.leftForTabId)) {
    return { ...tab, shownOver: { tabId: activeTabId }, leftForTabId: null }
  }
  return activeTabId === tab.leftForTabId ? tab : { ...tab, leftForTabId: null }
}

/** Keeps every Settings tab in step with its group's layout tabs, which change from many places
 *  (strip, shortcuts, agents, the host). Null when nothing moved. */
export function settingsTabsAfterGroupChanges(
  state: PlacementState
): Pick<AppState, 'settingsTabsByWorktree'> | null {
  let next: SettingsTabsByWorktree | null = null
  for (const [worktreeId, tab] of Object.entries(state.settingsTabsByWorktree ?? {})) {
    const group = resolveSettingsTabGroup(state, worktreeId)
    const settled = group ? settingsTabAfterGroupChange(tab, group) : tab
    if (settled !== tab) {
      next ??= { ...state.settingsTabsByWorktree }
      next[worktreeId] = settled
    }
  }
  return next ? { settingsTabsByWorktree: next } : null
}

/** Whether Settings is the tab to go back to: the group's active tab is the one that replaced it. */
export function isSettingsTabPrevious(state: PlacementState, worktreeId: string): boolean {
  const tab = settingsTabOf(state, worktreeId)
  const activeTabId = resolveSettingsTabGroup(state, worktreeId)?.activeTabId ?? null
  return tab?.leftForTabId != null && tab.shownOver === null && tab.leftForTabId === activeTabId
}

/** Where a Settings tab opens: the focused group of the workspace on screen. Null when no
 *  workspace can hold it (none open, or one is being created), and Settings opens as a page. */
export function resolveSettingsTabOpenTarget(
  state: Pick<
    AppState,
    | 'activeWorktreeId'
    | 'groupsByWorktree'
    | 'activeGroupIdByWorktree'
    | 'activePendingCreationId'
    | 'pendingWorktreeCreations'
  >
): { worktreeId: string; groupId: string } | null {
  const worktreeId = state.activeWorktreeId
  // Why 'terminal': the question is what the workspace view would show, whatever page is open now.
  if (!worktreeId || selectWorktreeCreationSurfaceShown({ ...state, activeView: 'terminal' })) {
    return null
  }
  const groups = state.groupsByWorktree[worktreeId] ?? EMPTY_GROUPS
  const group =
    groups.find((candidate) => candidate.id === state.activeGroupIdByWorktree[worktreeId]) ??
    groups[0]
  return group ? { worktreeId, groupId: group.id } : null
}
