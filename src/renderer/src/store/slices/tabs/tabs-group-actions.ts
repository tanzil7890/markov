import { createNonSecureContextUuid as createBrowserUuid } from '../../../../../shared/non-secure-context-uuid'
import type { TabSplitTarget, TabsSlice, TabsSliceGet, TabsSliceSet } from './tabs-slice-contract'
import { activeSurfacePatchMatchesState, buildActiveSurfacePatch } from './tabs-surface'
import type { TabGroup } from '../../../../../shared/tab-types'
import {
  buildSplitNode,
  collapseGroupLayout,
  replaceLeaf
} from '../../../../../shared/workspace-layout/tab-group-layout-tree'
import { workspaceRootGroupId } from '../../../../../shared/workspace-layout/workspace-layout-minted-ids'
import { insertTabIdIntoOrder } from '../../../../../shared/workspace-layout/tab-order'
import { resolveUnifiedTabCreatePlacement } from './tabs-create-placement'
import { ownsGlobalSelection } from '../../global-selection-owner'
import {
  isRightSidebarTabGroupId,
  layoutTabGroups
} from '../../../../../shared/workspace-layout/right-sidebar-tab-group'

type SplitGroupState = Pick<
  TabsSlice,
  'groupsByWorktree' | 'layoutByWorktree' | 'activeGroupIdByWorktree'
>

/** Places `newGroup` beside the target's source group; callers that fill it do so in the same update. */
export function insertSplitGroup(
  state: SplitGroupState,
  worktreeId: string,
  target: TabSplitTarget,
  newGroup: TabGroup
): SplitGroupState {
  const { sourceGroupId, splitDirection } = target
  const currentLayout =
    state.layoutByWorktree[worktreeId] ?? ({ type: 'leaf', groupId: sourceGroupId } as const)
  const replacement = buildSplitNode(
    sourceGroupId,
    newGroup.id,
    splitDirection === 'left' || splitDirection === 'right' ? 'horizontal' : 'vertical',
    splitDirection === 'left' || splitDirection === 'up' ? 'first' : 'second'
  )
  return {
    groupsByWorktree: {
      ...state.groupsByWorktree,
      [worktreeId]: [...(state.groupsByWorktree[worktreeId] ?? []), newGroup]
    },
    layoutByWorktree: {
      ...state.layoutByWorktree,
      [worktreeId]: replaceLeaf(currentLayout, sourceGroupId, replacement)
    },
    activeGroupIdByWorktree:
      target.activate === false
        ? state.activeGroupIdByWorktree
        : { ...state.activeGroupIdByWorktree, [worktreeId]: newGroup.id }
  }
}

export function emptySplitGroup(worktreeId: string, groupId: string): TabGroup {
  return { id: groupId, worktreeId, activeTabId: null, tabOrder: [] }
}

export function createTabsGroupActions(
  set: TabsSliceSet,
  get: TabsSliceGet
): Pick<
  TabsSlice,
  'ensureWorktreeRootGroup' | 'focusGroup' | 'closeEmptyGroup' | 'createEmptySplitGroup'
> {
  return {
    ensureWorktreeRootGroup: (worktreeId, orderSlot) => {
      // The sidebar's group is not a root; a workspace holding only it still gets one.
      const existingGroups = layoutTabGroups(get().groupsByWorktree[worktreeId] ?? [])
      if (!orderSlot && existingGroups.length > 0) {
        const activeGroupId = get().activeGroupIdByWorktree[worktreeId]
        return activeGroupId && existingGroups.some((group) => group.id === activeGroupId)
          ? activeGroupId
          : existingGroups[0].id
      }

      let groupId = workspaceRootGroupId(worktreeId)
      set((state) => {
        const groups = state.groupsByWorktree[worktreeId] ?? []
        const reserved =
          orderSlot && groups.find((group) => group.tabOrder.includes(orderSlot.tabId))
        if (reserved) {
          groupId = reserved.id
          return state
        }
        const tabs = state.unifiedTabsByWorktree[worktreeId] ?? []
        const laidOutGroups = layoutTabGroups(groups)
        const placement = resolveUnifiedTabCreatePlacement({
          groups: laidOutGroups,
          tabs,
          activeGroupId: state.activeGroupIdByWorktree[worktreeId],
          targetGroupId: orderSlot?.targetGroupId,
          lookupWorktrees: () => []
        })
        const group =
          laidOutGroups.find((entry) => entry.id === placement.groupId) ??
          laidOutGroups[0] ??
          emptySplitGroup(worktreeId, groupId)
        groupId = group.id
        let tabOrder = group.tabOrder
        if (orderSlot) {
          const { tabId, precedingTabIds } = orderSlot
          const preceding = new Set(precedingTabIds)
          const anchor = tabOrder.findLast((id) => preceding.has(id))
          tabOrder = insertTabIdIntoOrder(tabOrder, tabs, tabId, false, anchor)
          if (!anchor && precedingTabIds.length === 0) {
            tabOrder.splice(tabOrder.indexOf(tabId), 1)
            const firstUnpinned = tabOrder.findIndex(
              (id) => !tabs.find((tab) => tab.id === id)?.isPinned
            )
            tabOrder.splice(firstUnpinned === -1 ? tabOrder.length : firstUnpinned, 0, tabId)
          }
        }
        // A new root and its first order member must become observable together.
        const nextGroup = { ...group, tabOrder }
        return {
          groupsByWorktree: {
            ...state.groupsByWorktree,
            [worktreeId]: laidOutGroups.length
              ? groups.map((entry) => (entry.id === groupId ? nextGroup : entry))
              : [nextGroup, ...groups]
          },
          layoutByWorktree: {
            ...state.layoutByWorktree,
            [worktreeId]: (orderSlot && state.layoutByWorktree[worktreeId]) || {
              type: 'leaf',
              groupId
            }
          },
          activeGroupIdByWorktree: laidOutGroups.length
            ? state.activeGroupIdByWorktree
            : {
                ...state.activeGroupIdByWorktree,
                [worktreeId]: groupId
              }
        }
      })
      return groupId
    },

    focusGroup: (worktreeId, groupId) =>
      set((state) => {
        // The sidebar shows its own terminals; the main area's focus stays where it was.
        if (isRightSidebarTabGroupId(worktreeId, groupId)) {
          return state
        }
        const groupAlreadyFocused = state.activeGroupIdByWorktree[worktreeId] === groupId
        const nextActiveGroupIdByWorktree = groupAlreadyFocused
          ? state.activeGroupIdByWorktree
          : {
              ...state.activeGroupIdByWorktree,
              [worktreeId]: groupId
            }
        // Only surface tabs of the active workspace; focusing an unseen group must not consume its bell.
        if (state.activeWorktreeId !== worktreeId) {
          if (groupAlreadyFocused) {
            return state
          }
          return {
            activeGroupIdByWorktree: nextActiveGroupIdByWorktree
          }
        }
        const activeSurfacePatch = buildActiveSurfacePatch(
          {
            ...state,
            activeGroupIdByWorktree: nextActiveGroupIdByWorktree
          },
          worktreeId,
          groupId
        )
        if (
          groupAlreadyFocused &&
          activeSurfacePatchMatchesState(state, worktreeId, activeSurfacePatch)
        ) {
          return state
        }
        return {
          ...(groupAlreadyFocused ? {} : { activeGroupIdByWorktree: nextActiveGroupIdByWorktree }),
          ...activeSurfacePatch
        }
      }),

    closeEmptyGroup: (worktreeId, groupId) => {
      const state = get()
      const group = (state.groupsByWorktree[worktreeId] ?? []).find(
        (candidate) => candidate.id === groupId
      )
      const realIds = new Set((state.unifiedTabsByWorktree[worktreeId] ?? []).map((tab) => tab.id))
      if (!group || group.tabOrder.some((id) => realIds.has(id))) {
        return false
      }
      set((current) => {
        const remainingGroups = (current.groupsByWorktree[worktreeId] ?? []).filter(
          (candidate) => candidate.id !== groupId
        )
        const collapsedState = collapseGroupLayout(
          current.layoutByWorktree,
          current.activeGroupIdByWorktree,
          worktreeId,
          groupId,
          layoutTabGroups(remainingGroups)[0]?.id ?? null
        )
        // Why: drop the dead group's recent-quick-command entry so the map can't grow unbounded as groups open/close.
        const { [groupId]: _droppedRecent, ...remainingRecent } =
          current.recentQuickCommandIdByGroup
        return {
          groupsByWorktree: { ...current.groupsByWorktree, [worktreeId]: remainingGroups },
          layoutByWorktree: collapsedState.layoutByWorktree,
          activeGroupIdByWorktree: collapsedState.activeGroupIdByWorktree,
          recentQuickCommandIdByGroup: remainingRecent,
          ...(ownsGlobalSelection(current, worktreeId)
            ? buildActiveSurfacePatch(
                {
                  ...current,
                  groupsByWorktree: {
                    ...current.groupsByWorktree,
                    [worktreeId]: remainingGroups
                  },
                  layoutByWorktree: collapsedState.layoutByWorktree,
                  activeGroupIdByWorktree: collapsedState.activeGroupIdByWorktree
                },
                worktreeId,
                collapsedState.activeGroupIdByWorktree[worktreeId] ?? null
              )
            : {})
        }
      })
      return true
    },

    createEmptySplitGroup: (worktreeId, sourceGroupId, direction, opts) => {
      const newGroupId = createBrowserUuid()
      set((state) =>
        insertSplitGroup(
          state,
          worktreeId,
          { sourceGroupId, splitDirection: direction, activate: opts?.activate },
          emptySplitGroup(worktreeId, newGroupId)
        )
      )
      get().recordFeatureInteraction?.('terminal-panes')
      return newGroupId
    }
  }
}
