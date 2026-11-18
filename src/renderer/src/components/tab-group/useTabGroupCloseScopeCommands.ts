import { useCallback } from 'react'
import { useAppStore } from '../../store'
import { captureWorkspaceEmptiedReaction } from './workspace-emptied-reaction'
import { isEditorTabContentType } from '@/store/slices/editor/tabs/editor-tab-content-type'
import { useBulkTabCloseConfirmation } from '../use-bulk-tab-close-confirmation'
import type { BulkTabCloseScope } from '../../../../shared/bulk-tab-close-confirmation'
import { SETTINGS_TAB_ID, settingsTabOf, visualTabOrder } from '@/lib/settings-tab-placement'
import { requestSettingsClose } from '@/lib/settings-close-request'

export function useTabGroupCloseScopeCommands({
  groupId,
  worktreeId,
  closeItem,
  closeMany
}: {
  groupId: string
  worktreeId: string
  closeItem: (itemId: string, opts?: { skipEmptyCheck?: boolean }) => void
  closeMany: (itemIds: string[]) => void
}) {
  const closeEmptyGroup = useAppStore((state) => state.closeEmptyGroup)
  const confirmBulkClose = useBulkTabCloseConfirmation()
  const selectTabIds = useCallback(
    (scope: BulkTabCloseScope, itemId?: string): string[] => {
      const state = useAppStore.getState()
      const group = (state.groupsByWorktree[worktreeId] ?? []).find(
        (candidate) => candidate.id === groupId
      )
      if (!group) {
        return []
      }
      const tabs = (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(
        (tab) => tab.groupId === groupId
      )
      if (scope === 'editors') {
        return tabs
          .filter((tab) => isEditorTabContentType(tab.contentType) && !tab.isPinned)
          .map((tab) => tab.id)
      }
      // The Settings tab counts as one of the group's tabs: it can be the origin, and it can be closed.
      const visualOrder = visualTabOrder(state, worktreeId, group)
      const closesSettingsTab =
        itemId !== SETTINGS_TAB_ID &&
        visualOrder.includes(SETTINGS_TAB_ID) &&
        settingsTabOf(state, worktreeId)?.isPinned === false
      if (
        itemId === undefined ||
        (itemId === SETTINGS_TAB_ID
          ? !visualOrder.includes(SETTINGS_TAB_ID)
          : !tabs.some((tab) => tab.id === itemId))
      ) {
        return []
      }
      if (scope === 'others') {
        const others = tabs.filter((tab) => tab.id !== itemId && !tab.isPinned).map((tab) => tab.id)
        return closesSettingsTab ? [...others, SETTINGS_TAB_ID] : others
      }
      const index = visualOrder.indexOf(itemId)
      if (index === -1) {
        return []
      }
      const order = scope === 'right' ? visualOrder.slice(index + 1) : visualOrder.slice(0, index)
      const closableIds = new Set(tabs.filter((tab) => !tab.isPinned).map((tab) => tab.id))
      if (closesSettingsTab) {
        closableIds.add(SETTINGS_TAB_ID)
      }
      return order.filter((id) => closableIds.has(id))
    },
    [groupId, worktreeId]
  )
  const closeSelected = useCallback(
    (ids: string[]) => {
      closeMany(ids.filter((id) => id !== SETTINGS_TAB_ID))
      if (ids.includes(SETTINGS_TAB_ID)) {
        requestSettingsClose()
      }
    },
    [closeMany]
  )

  const closeGroup = useCallback(() => {
    const whenEmptied = captureWorkspaceEmptiedReaction(worktreeId)
    const items = [...(useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? [])].filter(
      (item) => item.groupId === groupId
    )
    for (const item of items) {
      closeItem(item.id, { skipEmptyCheck: true })
    }
    // Why: closing tabs doesn't remove the group shell; empty split groups are layout state, collapse the placeholder pane here.
    closeEmptyGroup(worktreeId, groupId)
    whenEmptied()
  }, [closeEmptyGroup, closeItem, groupId, worktreeId])

  const closeAllEditorTabsInGroup = useCallback(() => {
    confirmBulkClose(
      'editors',
      () => selectTabIds('editors'),
      (ids) => {
        for (const id of ids) {
          closeItem(id)
        }
      }
    )
  }, [closeItem, confirmBulkClose, selectTabIds])

  const closeOthers = useCallback(
    (itemId: string) => {
      // Why: store closeOtherTabs strands dirty files if the save dialog is cancelled; route via closeMany to stay dirty-aware.
      confirmBulkClose('others', () => selectTabIds('others', itemId), closeSelected)
    },
    [closeSelected, confirmBulkClose, selectTabIds]
  )

  const closeInDirection = useCallback(
    (itemId: string, direction: 'left' | 'right') => {
      confirmBulkClose(direction, () => selectTabIds(direction, itemId), closeSelected)
    },
    [closeSelected, confirmBulkClose, selectTabIds]
  )

  const closeToRight = useCallback(
    (itemId: string) => closeInDirection(itemId, 'right'),
    [closeInDirection]
  )
  const closeToLeft = useCallback(
    (itemId: string) => closeInDirection(itemId, 'left'),
    [closeInDirection]
  )

  return { closeGroup, closeAllEditorTabsInGroup, closeOthers, closeToRight, closeToLeft }
}
