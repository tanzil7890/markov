import { useAppStore } from '@/store'

let guardedClose: (() => void) | null = null

/** Mounted Settings registers its own close, which first offers to keep unsaved edits. */
export function registerSettingsCloseHandler(handler: () => void): () => void {
  guardedClose = handler
  return () => {
    if (guardedClose === handler) {
      guardedClose = null
    }
  }
}

/** Closes Settings from outside it (its tab's close button, the close-tab shortcut, a bulk close). */
export function requestSettingsClose(): void {
  const state = useAppStore.getState()
  // Why only then: other workspaces' Settings tabs keep the one Settings surface, and its edits, alive.
  const closesTheSurface =
    state.activeView === 'settings' || Object.keys(state.settingsTabsByWorktree ?? {}).length <= 1
  if (guardedClose && closesTheSurface) {
    guardedClose()
    return
  }
  state.closeSettingsPage()
}
