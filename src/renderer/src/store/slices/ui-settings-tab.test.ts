import { describe, expect, it, vi } from 'vitest'
import type { TabGroup } from '../../../../shared/tab-types'
import {
  SETTINGS_TAB_ID,
  isSettingsTabShown,
  selectSettingsTabStrip,
  isSettingsTabPrevious,
  settingsTabsAfterGroupChanges,
  settingsTabsAfterTabPick,
  settingsTabsWithTabPlaced,
  visualTabOrder
} from '../../lib/settings-tab-placement'
import { createUIStore } from './ui-slice-test-harness'

function group(id: string, activeTabId: string, tabOrder: string[], worktreeId = 'wt'): TabGroup {
  return { id, worktreeId, activeTabId, tabOrder }
}

function storeWithWorkspace() {
  const store = createUIStore()
  store.setState({
    activeWorktreeId: 'wt',
    groupsByWorktree: {
      wt: [group('left', 'chat-1', ['chat-1']), group('right', 'term-1', ['term-1', 'term-2'])],
      other: [group('only', 'chat-9', ['chat-9'], 'other')]
    },
    activeGroupIdByWorktree: { wt: 'right', other: 'only' },
    activePendingCreationId: null,
    pendingWorktreeCreations: {},
    focusGroup: vi.fn()
  })
  return store
}

describe('Settings as a workspace tab', () => {
  it('opens last in the focused group of the workspace on screen, leaving the page it was opened from', () => {
    const store = storeWithWorkspace()
    store.getState().openTaskPage()

    store.getState().openSettingsPage()

    expect(store.getState().activeView).toBe('terminal')
    expect(store.getState().settingsTabsByWorktree.wt).toMatchObject({
      groupId: 'right',
      shownOver: { tabId: 'term-1' },
      leftTabIds: ['term-1', 'term-2'],
      isPinned: false
    })
    expect(selectSettingsTabStrip(store.getState(), 'wt', 'right')?.shown).toBe(true)
    expect(selectSettingsTabStrip(store.getState(), 'wt', 'left')).toBeNull()
  })

  it('opens as a page when no workspace is open', () => {
    const store = createUIStore()

    store.getState().openSettingsPage()

    expect(store.getState().activeView).toBe('settings')
    expect(store.getState().settingsTabsByWorktree).toEqual({})
  })

  it('keeps one tab per workspace', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()
    store.setState({ activeWorktreeId: 'other' })

    store.getState().openSettingsPage()

    expect(Object.keys(store.getState().settingsTabsByWorktree)).toEqual(['wt', 'other'])
    expect(store.getState().settingsTabsByWorktree.other.groupId).toBe('only')

    store.getState().closeSettingsPage()
    expect(Object.keys(store.getState().settingsTabsByWorktree)).toEqual(['wt'])
  })

  it('goes back to the strip when its group shows another tab, and returns on a pick', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()

    store.setState({
      groupsByWorktree: {
        wt: [group('left', 'chat-1', ['chat-1']), group('right', 'term-2', ['term-1', 'term-2'])]
      }
    })
    expect(selectSettingsTabStrip(store.getState(), 'wt', 'right')?.shown).toBe(false)

    store.getState().showSettingsTab('wt')
    expect(store.getState().settingsTabsByWorktree.wt.shownOver).toEqual({ tabId: 'term-2' })
    expect(isSettingsTabShown(store.getState(), 'wt')).toBe(true)
  })

  it('uncovers the tab under it when that tab is picked again', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()

    store.setState(settingsTabsAfterTabPick(store.getState(), 'wt', 'right', 'term-1') ?? {})

    expect(store.getState().settingsTabsByWorktree.wt.shownOver).toBeNull()
    expect(isSettingsTabPrevious(store.getState(), 'wt')).toBe(true)
    expect(settingsTabsAfterTabPick(store.getState(), 'wt', 'left', 'chat-1')).toBeNull()
  })

  it('is the previous tab only while the tab that replaced it shows, and returns when that tab closes', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()
    const showInRight = (activeTabId: string, tabOrder: string[]): void => {
      store.setState({
        groupsByWorktree: {
          wt: [group('left', 'chat-1', ['chat-1']), group('right', activeTabId, tabOrder)]
        }
      })
      store.setState(settingsTabsAfterGroupChanges(store.getState()) ?? {})
    }

    showInRight('term-2', ['term-1', 'term-2'])
    expect(isSettingsTabShown(store.getState(), 'wt')).toBe(false)
    expect(isSettingsTabPrevious(store.getState(), 'wt')).toBe(true)

    showInRight('term-1', ['term-1'])
    expect(isSettingsTabShown(store.getState(), 'wt')).toBe(true)

    showInRight('term-3', ['term-1', 'term-3'])
    showInRight('term-1', ['term-1', 'term-3'])
    expect(isSettingsTabPrevious(store.getState(), 'wt')).toBe(false)
  })

  it('stays shown when the tab under it closes', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()
    store.setState({
      groupsByWorktree: {
        wt: [group('left', 'chat-1', ['chat-1']), group('right', 'term-2', ['term-2'])]
      }
    })

    store.setState(settingsTabsAfterGroupChanges(store.getState()) ?? {})

    expect(store.getState().settingsTabsByWorktree.wt.shownOver).toEqual({ tabId: 'term-2' })
    expect(isSettingsTabShown(store.getState(), 'wt')).toBe(true)
  })

  it('keeps its place among the tabs after a drop, and when a tab on its left closes', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()
    const right = store.getState().groupsByWorktree.wt[1]

    store.setState(
      settingsTabsWithTabPlaced(store.getState(), 'wt', 'right', [
        'term-1',
        SETTINGS_TAB_ID,
        'term-2'
      ]) ?? {}
    )
    expect(visualTabOrder(store.getState(), 'wt', right)).toEqual([
      'term-1',
      SETTINGS_TAB_ID,
      'term-2'
    ])

    expect(visualTabOrder(store.getState(), 'wt', { id: 'right', tabOrder: ['term-2'] })).toEqual([
      SETTINGS_TAB_ID,
      'term-2'
    ])
  })

  it('moves to another group on a drop there and covers that group', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()

    store.setState(
      settingsTabsWithTabPlaced(store.getState(), 'wt', 'left', ['chat-1', SETTINGS_TAB_ID]) ?? {}
    )

    expect(store.getState().settingsTabsByWorktree.wt).toMatchObject({
      groupId: 'left',
      leftTabIds: ['chat-1'],
      shownOver: { tabId: 'chat-1' }
    })
  })

  it('closes without leaving the workspace', () => {
    const store = storeWithWorkspace()
    store.getState().openSettingsPage()

    store.getState().closeSettingsPage()

    expect(store.getState().settingsTabsByWorktree).toEqual({})
    expect(store.getState().activeView).toBe('terminal')
  })
})
