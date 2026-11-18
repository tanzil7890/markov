import type { SettingsTab, SettingsTabsByWorktree } from './settings-tab-placement'

const SETTINGS_TABS_STORAGE_KEY = 'markov-settings-tabs-v1'
// Removed workspaces leave their entry behind; the newest ones are the ones still in use.
const MAX_STORED_SETTINGS_TABS = 64

function getWindowStorage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readSettingsTab(value: unknown): SettingsTab | null {
  if (!isRecord(value) || typeof value.groupId !== 'string') {
    return null
  }
  const coveredTabId = isRecord(value.shownOver) ? value.shownOver.tabId : undefined
  return {
    groupId: value.groupId,
    shownOver:
      typeof coveredTabId === 'string' || coveredTabId === null ? { tabId: coveredTabId } : null,
    leftTabIds: Array.isArray(value.leftTabIds)
      ? value.leftTabIds.filter((id): id is string => typeof id === 'string')
      : [],
    isPinned: value.isPinned === true,
    // Not restored: it describes the tab order of the session that wrote it.
    leftForTabId: null,
    lastShownAt: typeof value.lastShownAt === 'number' ? value.lastShownAt : 0
  }
}

/** Settings tabs live outside the workspace layout, so this window restores them itself. */
export function readPersistedSettingsTabs(): SettingsTabsByWorktree {
  try {
    const serialized = getWindowStorage()?.getItem(SETTINGS_TABS_STORAGE_KEY)
    const parsed: unknown = serialized ? JSON.parse(serialized) : null
    if (!isRecord(parsed)) {
      return {}
    }
    const tabs: SettingsTabsByWorktree = {}
    for (const [worktreeId, value] of Object.entries(parsed)) {
      const tab = readSettingsTab(value)
      if (tab) {
        tabs[worktreeId] = tab
      }
    }
    return tabs
  } catch {
    return {}
  }
}

export function persistSettingsTabs(tabs: SettingsTabsByWorktree): void {
  try {
    const newest = Object.entries(tabs)
      .sort(([, a], [, b]) => b.lastShownAt - a.lastShownAt)
      .slice(0, MAX_STORED_SETTINGS_TABS)
    getWindowStorage()?.setItem(
      SETTINGS_TABS_STORAGE_KEY,
      JSON.stringify(Object.fromEntries(newest))
    )
  } catch {
    // Why: storage can be unavailable or full; losing the restore is not worth a crash.
  }
}
