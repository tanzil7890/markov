import type { TabGroup, TabGroupLayoutNode } from '../../../../shared/tab-types'
import { isRightSidebarTabGroupId } from '../../../../shared/workspace-layout/right-sidebar-tab-group'

export function getEffectiveLayoutForWorktree(
  worktreeId: string,
  layoutByWorktree: Record<string, TabGroupLayoutNode | undefined>,
  groupsByWorktree: Record<string, readonly Pick<TabGroup, 'id'>[]>,
  activeGroupIdByWorktree: Record<string, string | undefined>
): TabGroupLayoutNode | undefined {
  const layout = layoutByWorktree[worktreeId]
  if (layout) {
    return layout
  }
  // The sidebar's group is never drawn in the main area.
  const groups = (groupsByWorktree[worktreeId] ?? []).filter(
    (group) => !isRightSidebarTabGroupId(worktreeId, group.id)
  )
  const activeGroupId = activeGroupIdByWorktree[worktreeId]
  const fallbackGroupId =
    (groups.some((group) => group.id === activeGroupId) ? activeGroupId : groups[0]?.id) ?? null
  if (!fallbackGroupId) {
    return undefined
  }
  return { type: 'leaf', groupId: fallbackGroupId } as const
}

/** The container owns every mounted worktree’s panes; gating on the active layout alone destroys background PaneManagers, buffers and PTYs during switches. */
export function anyMountedWorktreeHasLayout(
  allWorktreeIds: string[],
  mountedWorktreeIds: ReadonlySet<string>,
  layoutByWorktree: Record<string, TabGroupLayoutNode | undefined>,
  groupsByWorktree: Record<string, TabGroup[]>,
  activeGroupIdByWorktree: Record<string, string | undefined>
): boolean {
  return allWorktreeIds.some(
    (id) =>
      mountedWorktreeIds.has(id) &&
      getEffectiveLayoutForWorktree(id, layoutByWorktree, groupsByWorktree, activeGroupIdByWorktree)
  )
}
