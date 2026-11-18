import type { DragEndEvent } from '@dnd-kit/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TabDragItemData } from './tab-drag-data'

const placeSettingsTab = vi.fn()
const focusGroup = vi.fn()
const storeState: Record<string, unknown> = {}

vi.mock('../../store', () => ({ useAppStore: { getState: () => storeState } }))
vi.mock('../tab-bar/web-runtime-tab-move-mirror', () => ({ mirrorWebRuntimeTabMove: vi.fn() }))
vi.mock('./tab-group-panel-split-target', () => ({
  resolveActivePaneColumnSplitTarget: () => null
}))
vi.mock('./tab-group-layout-owner-commands', () => ({ dropTabThroughLayoutOwner: () => false }))

import { commitTabDragDrop } from './tab-drag-drop-commit'
import { recordTabDragPointer } from './tab-drag-pointer'

function tab(id: string, groupId = 'g'): TabDragItemData {
  return {
    kind: 'tab',
    worktreeId: 'wt',
    groupId,
    unifiedTabId: id,
    visibleTabId: id,
    tabType: id === 'settings-tab' ? 'settings' : 'terminal',
    label: id
  }
}

/** Drops `active` on the left or right half of `over`, whose tab spans x 0 to 100. */
function drop(active: TabDragItemData, over: TabDragItemData, side: 'left' | 'right') {
  recordTabDragPointer({ x: side === 'left' ? 10 : 90, y: 10 })
  const event: DragEndEvent = {
    activatorEvent: new Event('pointerdown'),
    active: {
      id: active.visibleTabId,
      data: { current: active },
      rect: { current: { initial: null, translated: null } }
    },
    collisions: null,
    delta: { x: 0, y: 0 },
    over: {
      id: over.visibleTabId,
      data: { current: over },
      disabled: false,
      rect: { left: 0, right: 100, top: 0, bottom: 30, width: 100, height: 30 }
    }
  }
  const reorderUnifiedTabs = vi.fn()
  const dropUnifiedTab = vi.fn(() => true)
  commitTabDragDrop({
    event,
    worktreeId: 'wt',
    dragGeometryRef: { current: null },
    dropUnifiedTab,
    reorderUnifiedTabs,
    finishDrag: vi.fn()
  })
  return { reorderUnifiedTabs, dropUnifiedTab }
}

function setWorkspace(
  groups: Record<string, string[]>,
  settingsTab: { groupId: string; leftTabIds: string[] } | null
): void {
  Object.assign(storeState, {
    layoutByWorktree: {},
    groupsByWorktree: {
      wt: Object.entries(groups).map(([id, tabOrder]) => ({
        id,
        worktreeId: 'wt',
        activeTabId: tabOrder[0] ?? null,
        tabOrder
      }))
    },
    settingsTabsByWorktree: settingsTab
      ? {
          wt: {
            ...settingsTab,
            shownOver: null,
            isPinned: false,
            leftForTabId: null,
            lastShownAt: 1
          }
        }
      : {},
    placeSettingsTab,
    focusGroup
  })
}

describe('tab drop with a Settings tab in the strip', () => {
  beforeEach(() => {
    placeSettingsTab.mockClear()
    focusGroup.mockClear()
  })

  it('reorders layout tabs as before when the strip has no Settings tab', () => {
    setWorkspace({ g: ['a', 'b', 'c'] }, null)

    const { reorderUnifiedTabs } = drop(tab('a'), tab('c'), 'right')

    expect(reorderUnifiedTabs).toHaveBeenCalledWith('g', ['b', 'c', 'a'])
  })

  it('moves the Settings tab without touching the layout order', () => {
    setWorkspace({ g: ['a', 'b'] }, { groupId: 'g', leftTabIds: ['a', 'b'] })

    const { reorderUnifiedTabs } = drop(tab('settings-tab'), tab('a'), 'left')

    expect(placeSettingsTab).toHaveBeenCalledWith('wt', 'g', ['settings-tab', 'a', 'b'])
    expect(reorderUnifiedTabs).not.toHaveBeenCalled()
  })

  it('places a layout tab on the dropped side of the Settings tab', () => {
    setWorkspace({ g: ['a', 'b'] }, { groupId: 'g', leftTabIds: ['a'] })

    const { reorderUnifiedTabs } = drop(tab('b'), tab('settings-tab'), 'left')

    expect(placeSettingsTab).toHaveBeenCalledWith('wt', 'g', ['a', 'b', 'settings-tab'])
    expect(reorderUnifiedTabs).not.toHaveBeenCalled()
  })

  it('reorders layout tabs across the Settings tab and keeps it in place', () => {
    setWorkspace({ g: ['a', 'b', 'c'] }, { groupId: 'g', leftTabIds: ['a'] })

    const { reorderUnifiedTabs } = drop(tab('a'), tab('c'), 'right')

    expect(reorderUnifiedTabs).toHaveBeenCalledWith('g', ['b', 'c', 'a'])
    expect(placeSettingsTab).toHaveBeenCalledWith('wt', 'g', ['settings-tab', 'b', 'c', 'a'])
  })

  it('moves the Settings tab into another group and focuses that group', () => {
    setWorkspace({ g: ['a'], other: ['x', 'y'] }, { groupId: 'g', leftTabIds: ['a'] })

    drop(tab('settings-tab'), tab('y', 'other'), 'left')

    expect(placeSettingsTab).toHaveBeenCalledWith('wt', 'other', ['x', 'settings-tab', 'y'])
    expect(focusGroup).toHaveBeenCalledWith('wt', 'other')
  })
})
