import type { UISlice, UISliceGet, UISliceSet } from './ui-slice-contract'
import { isSettingsNavigationTarget } from '../../../lib/settings-navigation-types'
import { closeFullPageViews } from '../../../lib/full-page-view-exit'
import {
  resolveSettingsTabOpenTarget,
  settingsTabsWithPinned,
  settingsTabsWithTabPlaced,
  settingsTabsWithTabShown,
  settingsTabsWithout
} from '../../../lib/settings-tab-placement'
import { readPersistedSettingsTabs } from '../../../lib/settings-tab-storage'

export function createUiSettingsActions(set: UISliceSet, get: UISliceGet): Partial<UISlice> {
  return {
    openSettingsPage: () => {
      // Why: settings search is a transient filter; opening Settings shouldn't inherit hidden sections from last visit.
      get().setSettingsSearchQuery('')
      // Why not while the page is open: swapping it for a tab would remount Settings and drop unsaved edits.
      const target = get().activeView === 'settings' ? null : resolveSettingsTabOpenTarget(get())
      if (target) {
        // Why: the tab lives in the workspace view, so Tasks or any other page leaves first.
        closeFullPageViews(get)
        set((state) => ({
          activeView: 'terminal',
          ...settingsTabsWithTabShown(state, target.worktreeId, target.groupId, Date.now())
        }))
        const groupId = get().settingsTabsByWorktree[target.worktreeId]?.groupId
        if (groupId) {
          get().focusGroup(target.worktreeId, groupId)
        }
        return
      }
      set((state) => ({
        activeView: 'settings',
        // Why: preserve the originating view so Settings back returns there (e.g. in-progress draft), not always terminal.
        previousViewBeforeSettings:
          state.activeView === 'settings' ? state.previousViewBeforeSettings : state.activeView
      }))
    },
    closeSettingsPage: () =>
      set((state) => {
        const tabClosed =
          state.activeView !== 'settings' && state.activeWorktreeId
            ? settingsTabsWithout(state, state.activeWorktreeId)
            : null
        return tabClosed ?? { activeView: state.previousViewBeforeSettings }
      }),
    settingsTabsByWorktree: readPersistedSettingsTabs(),
    showSettingsTab: (worktreeId) =>
      set((state) => {
        const groupId = state.settingsTabsByWorktree[worktreeId]?.groupId
        return (
          (groupId && settingsTabsWithTabShown(state, worktreeId, groupId, Date.now())) || state
        )
      }),
    placeSettingsTab: (worktreeId, groupId, visualOrder) =>
      set((state) => settingsTabsWithTabPlaced(state, worktreeId, groupId, visualOrder) ?? state),
    setSettingsTabPinned: (worktreeId, isPinned) =>
      set((state) => settingsTabsWithPinned(state, worktreeId, isPinned) ?? state),
    settingsNavigationTarget: null,
    openSettingsTarget: (target) => {
      if (!isSettingsNavigationTarget(target)) {
        if (import.meta.env.DEV) {
          throw new TypeError('openSettingsTarget received an invalid navigation target')
        }
        return
      }
      set({ settingsNavigationTarget: target })
    },
    clearSettingsTarget: () => set({ settingsNavigationTarget: null }),
    settingsProjectHostSelection: {},
    settingsProjectSetupSelection: {},
    // Keep project host selection renderer-only; neither direct nor debounced persistence includes it.
    setSettingsProjectHostSelection: (selectionKey, hostId, setupId) =>
      set((s) => {
        const nextSetupSelections = { ...s.settingsProjectSetupSelection }
        if (setupId) {
          nextSetupSelections[selectionKey] = setupId
        } else {
          delete nextSetupSelections[selectionKey]
        }
        if (
          s.settingsProjectHostSelection[selectionKey] === hostId &&
          s.settingsProjectSetupSelection[selectionKey] === setupId &&
          Object.keys(s.settingsProjectHostSelection).at(-1) === selectionKey
        ) {
          return s
        }
        // Reinsert so equivalent project/checkout keys resolve to the latest explicit pick.
        const nextHostSelections = { ...s.settingsProjectHostSelection }
        delete nextHostSelections[selectionKey]
        nextHostSelections[selectionKey] = hostId
        return {
          settingsProjectHostSelection: nextHostSelections,
          settingsProjectSetupSelection: nextSetupSelections
        }
      })
  }
}
