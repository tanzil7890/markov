import type { RefObject } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'
import { useAppStore } from '../../store'
import { mirrorWebRuntimeTabMove } from '../tab-bar/web-runtime-tab-move-mirror'
import { resolveTabInsertion } from './tab-insertion'
import { resolveSourceGroupRestoreOnDrop } from './tab-drag-preview-target'
import { getDragPointer } from './tab-drag-pointer'
import {
  resolveActivePaneColumnSplitTarget,
  type TabGroupPanelGeometrySnapshot
} from './tab-group-panel-split-target'
import { isPaneDropData, isTabDragData, type TabDragItemData } from './tab-drag-data'
import { MARKOV_LAYOUT_OWNER_IS_MAIN } from '../../../../shared/layout-owner-switch'
import { dropTabThroughLayoutOwner } from './tab-group-layout-owner-commands'
import { SETTINGS_TAB_ID, visualTabOrder } from '@/lib/settings-tab-placement'

type AppState = ReturnType<typeof useAppStore.getState>

/** Commit splits/reorders/moves through the layout owner or window path, then finish or restore the drag snapshot. */
export function commitTabDragDrop({
  event,
  worktreeId,
  dragGeometryRef,
  dropUnifiedTab,
  reorderUnifiedTabs,
  finishDrag
}: {
  event: DragEndEvent
  worktreeId: string
  dragGeometryRef: RefObject<TabGroupPanelGeometrySnapshot | null>
  dropUnifiedTab: AppState['dropUnifiedTab']
  reorderUnifiedTabs: AppState['reorderUnifiedTabs']
  finishDrag: (restoreSnapshot: boolean, activeData?: TabDragItemData) => void
}): void {
  const activeData = event.active.data.current
  const overData = event.over?.data.current
  let shouldRestorePreDragActivation = true

  if (!isTabDragData(activeData) || activeData.worktreeId !== worktreeId) {
    finishDrag(true)
    return
  }

  const state = useAppStore.getState()
  const paneColumnSplit = resolveActivePaneColumnSplitTarget({
    event,
    groupsByWorktree: state.groupsByWorktree,
    layoutByWorktree: state.layoutByWorktree,
    worktreeId,
    getDragPointer,
    geometry: dragGeometryRef.current
  })
  if (paneColumnSplit) {
    // End the drag now; main’s answer draws the requested pane placement.
    if (
      MARKOV_LAYOUT_OWNER_IS_MAIN &&
      dropTabThroughLayoutOwner(worktreeId, {
        kind: 'split',
        tabId: activeData.unifiedTabId,
        groupId: paneColumnSplit.groupId,
        direction: paneColumnSplit.zone
      })
    ) {
      finishDrag(true)
      return
    }
    const moved = dropUnifiedTab(activeData.unifiedTabId, {
      groupId: paneColumnSplit.groupId,
      splitDirection: paneColumnSplit.zone
    })
    if (moved) {
      shouldRestorePreDragActivation = false
      mirrorWebRuntimeTabMove({
        kind: 'split',
        worktreeId,
        tabId: activeData.unifiedTabId,
        targetGroupId: paneColumnSplit.groupId,
        splitDirection: paneColumnSplit.zone
      })
    }
    finishDrag(
      shouldRestorePreDragActivation,
      resolveSourceGroupRestoreOnDrop(
        activeData,
        paneColumnSplit.groupId,
        shouldRestorePreDragActivation
      )
    )
    return
  }

  if (!event.over) {
    finishDrag(true)
    return
  }

  if (isTabDragData(overData)) {
    if (activeData.unifiedTabId === overData.unifiedTabId) {
      finishDrag(true)
      return
    }

    const groups = state.groupsByWorktree[worktreeId] ?? []
    const targetGroup = groups.find((group) => group.id === overData.groupId)
    if (!targetGroup) {
      finishDrag(true)
      return
    }

    // Recompute insertion side at drop so the destination matches the drawn bar without stale closure state.
    const insertion = resolveTabInsertion(event, isTabDragData, getDragPointer)
    if (!insertion) {
      finishDrag(true)
      return
    }

    // Why the order on screen: the Settings tab sits among the layout tabs without being one, so a
    // drop is placed there first and then split into the layout order and the Settings tab's place.
    const visualOrder = visualTabOrder(state, worktreeId, targetGroup).filter(
      (id) => id !== activeData.unifiedTabId
    )
    const overVisualIndex = visualOrder.indexOf(overData.unifiedTabId)
    visualOrder.splice(
      overVisualIndex === -1
        ? visualOrder.length
        : overVisualIndex + (insertion.side === 'right' ? 1 : 0),
      0,
      activeData.unifiedTabId
    )
    state.placeSettingsTab(worktreeId, overData.groupId, visualOrder)
    if (activeData.unifiedTabId === SETTINGS_TAB_ID) {
      if (activeData.groupId !== overData.groupId) {
        state.focusGroup(worktreeId, overData.groupId)
      }
      finishDrag(activeData.groupId === overData.groupId)
      return
    }
    const nextOrder = visualOrder.filter((id) => id !== SETTINGS_TAB_ID)

    if (activeData.groupId === overData.groupId) {
      const oldIndex = targetGroup.tabOrder.indexOf(activeData.unifiedTabId)
      const nextIndex = nextOrder.indexOf(activeData.unifiedTabId)
      if (oldIndex !== -1 && oldIndex !== nextIndex) {
        if (
          MARKOV_LAYOUT_OWNER_IS_MAIN &&
          dropTabThroughLayoutOwner(worktreeId, {
            kind: 'reorder',
            tabId: activeData.unifiedTabId,
            groupId: overData.groupId,
            tabOrder: nextOrder
          })
        ) {
          finishDrag(true)
          return
        }
        reorderUnifiedTabs(overData.groupId, nextOrder)
        mirrorWebRuntimeTabMove({
          kind: 'reorder',
          worktreeId,
          tabId: activeData.unifiedTabId,
          targetGroupId: overData.groupId,
          tabOrder: nextOrder
        })
      }
    } else {
      const index = nextOrder.indexOf(activeData.unifiedTabId)
      if (
        MARKOV_LAYOUT_OWNER_IS_MAIN &&
        dropTabThroughLayoutOwner(worktreeId, {
          kind: 'move',
          tabId: activeData.unifiedTabId,
          groupId: overData.groupId,
          index
        })
      ) {
        finishDrag(true)
        return
      }
      const moved = dropUnifiedTab(activeData.unifiedTabId, {
        groupId: overData.groupId,
        index
      })
      if (moved) {
        shouldRestorePreDragActivation = false
        mirrorWebRuntimeTabMove({
          kind: 'move-to-group',
          worktreeId,
          tabId: activeData.unifiedTabId,
          targetGroupId: overData.groupId,
          index
        })
      }
    }

    finishDrag(
      shouldRestorePreDragActivation,
      resolveSourceGroupRestoreOnDrop(activeData, overData.groupId, shouldRestorePreDragActivation)
    )
    return
  }

  if (isPaneDropData(overData)) {
    if (activeData.unifiedTabId === SETTINGS_TAB_ID) {
      const targetGroup = (state.groupsByWorktree[worktreeId] ?? []).find(
        (group) => group.id === overData.groupId
      )
      if (targetGroup && activeData.groupId !== overData.groupId) {
        state.placeSettingsTab(worktreeId, overData.groupId, [
          ...targetGroup.tabOrder,
          SETTINGS_TAB_ID
        ])
        state.focusGroup(worktreeId, overData.groupId)
        finishDrag(false)
        return
      }
      finishDrag(true)
      return
    }
    if (activeData.groupId !== overData.groupId) {
      if (
        MARKOV_LAYOUT_OWNER_IS_MAIN &&
        dropTabThroughLayoutOwner(worktreeId, {
          kind: 'move',
          tabId: activeData.unifiedTabId,
          groupId: overData.groupId
        })
      ) {
        finishDrag(true)
        return
      }
      const moved = dropUnifiedTab(activeData.unifiedTabId, {
        groupId: overData.groupId
      })
      if (moved) {
        shouldRestorePreDragActivation = false
        mirrorWebRuntimeTabMove({
          kind: 'move-to-group',
          worktreeId,
          tabId: activeData.unifiedTabId,
          targetGroupId: overData.groupId
        })
      }
    }
  }

  finishDrag(
    shouldRestorePreDragActivation,
    isPaneDropData(overData)
      ? resolveSourceGroupRestoreOnDrop(
          activeData,
          overData.groupId,
          shouldRestorePreDragActivation
        )
      : undefined
  )
}
