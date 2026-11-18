import type { Tab, TabGroup, TabGroupLayoutNode } from '../tab-types'
import { nameBasedUuid } from './workspace-layout-minted-ids'
import { isTerminalWorkspaceEmptiedOnPurpose } from './closed-terminal-tab-tombstones'

/** The workspace's sidebar terminals live in one group the split layout never shows; its id is derived, so saved sessions need no new field. */
const idByWorktree = new Map<string, string>()

export function rightSidebarTabGroupId(worktreeId: string): string {
  let id = idByWorktree.get(worktreeId)
  if (id === undefined) {
    id = nameBasedUuid(`right-sidebar-group:${worktreeId}`)
    idByWorktree.set(worktreeId, id)
  }
  return id
}

export function isRightSidebarTabGroup(
  group: Pick<TabGroup, 'id' | 'worktreeId'> | undefined
): boolean {
  return group !== undefined && group.id === rightSidebarTabGroupId(group.worktreeId)
}

export function isRightSidebarTabGroupId(
  worktreeId: string,
  groupId: string | null | undefined
): boolean {
  return groupId !== null && groupId !== undefined && groupId === rightSidebarTabGroupId(worktreeId)
}

export function findRightSidebarTabGroup<T extends Pick<TabGroup, 'id' | 'worktreeId'>>(
  groups: readonly T[] | undefined
): T | undefined {
  return groups?.find(isRightSidebarTabGroup)
}

/** Groups the split layout shows, in their stored order. */
export function layoutTabGroups<T extends Pick<TabGroup, 'id' | 'worktreeId'>>(
  groups: readonly T[]
): T[] {
  return groups.filter((group) => !isRightSidebarTabGroup(group))
}

/** A workspace's terminal rows minus the ones the right sidebar shows. */
export function mainAreaTerminalRows<Row extends { id: string }>(
  state: {
    tabsByWorktree: Readonly<Record<string, readonly Row[] | undefined>>
    /** Absent in narrow test stores: then no row is a sidebar terminal. */
    unifiedTabsByWorktree?: Readonly<
      Record<string, readonly Pick<Tab, 'entityId' | 'groupId' | 'contentType'>[] | undefined>
    >
  },
  worktreeId: string
): readonly Row[] | undefined {
  const rows = state.tabsByWorktree[worktreeId]
  if (!rows || rows.length === 0) {
    return rows
  }
  const sidebarGroupId = rightSidebarTabGroupId(worktreeId)
  const sidebarEntityIds = new Set(
    (state.unifiedTabsByWorktree?.[worktreeId] ?? [])
      .filter((tab) => tab.contentType === 'terminal' && tab.groupId === sidebarGroupId)
      .map((tab) => tab.entityId)
  )
  return sidebarEntityIds.size === 0 ? rows : rows.filter((row) => !sidebarEntityIds.has(row.id))
}

/** Closed-on-purpose emptiness of the main area; sidebar terminals do not keep it open. */
export function isMainAreaEmptiedOnPurpose(
  state: Parameters<typeof mainAreaTerminalRows>[0] &
    Omit<Parameters<typeof isTerminalWorkspaceEmptiedOnPurpose>[0], 'tabsByWorktree'>,
  worktreeId: string
): boolean {
  return isTerminalWorkspaceEmptiedOnPurpose(
    Object.hasOwn(state.tabsByWorktree, worktreeId)
      ? { ...state, tabsByWorktree: { [worktreeId]: mainAreaTerminalRows(state, worktreeId) } }
      : state,
    worktreeId
  )
}

/** How many of these tabs the main area shows. */
export function countMainAreaTabs(
  worktreeId: string,
  tabs: readonly Pick<Tab, 'groupId'>[]
): number {
  return tabs.filter((tab) => !isRightSidebarTabGroupId(worktreeId, tab.groupId)).length
}

/** Closing a group's last tab drops the sidebar's group always, and a main group only while another stays laid out. */
export function dropsGroupOnLastTabClose(
  group: Pick<TabGroup, 'id' | 'worktreeId'>,
  groupsAfter: readonly Pick<TabGroup, 'id' | 'worktreeId'>[],
  hasLayout: boolean
): boolean {
  return isRightSidebarTabGroup(group) || (hasLayout && layoutTabGroups(groupsAfter).length > 1)
}

/** PTYs the workspace's sidebar terminals hold; they never stand in for the main area's surface. */
export function rightSidebarPtyIds(
  state: {
    unifiedTabsByWorktree: Readonly<
      Record<string, readonly Pick<Tab, 'entityId' | 'groupId' | 'contentType'>[] | undefined>
    >
    ptyIdsByTabId: Readonly<Record<string, readonly string[] | undefined>>
  },
  worktreeId: string
): Set<string> {
  const sidebarGroupId = rightSidebarTabGroupId(worktreeId)
  return new Set(
    (state.unifiedTabsByWorktree[worktreeId] ?? [])
      .filter((tab) => tab.contentType === 'terminal' && tab.groupId === sidebarGroupId)
      .flatMap((tab) => state.ptyIdsByTabId[tab.entityId] ?? [])
  )
}

/** Whether a layout shows the sidebar's group, which only a repair should ever find. */
export function layoutHoldsRightSidebarGroup(
  layout: TabGroupLayoutNode | undefined,
  worktreeId: string
): boolean {
  if (!layout) {
    return false
  }
  return layout.type === 'leaf'
    ? isRightSidebarTabGroupId(worktreeId, layout.groupId)
    : layoutHoldsRightSidebarGroup(layout.first, worktreeId) ||
        layoutHoldsRightSidebarGroup(layout.second, worktreeId)
}
