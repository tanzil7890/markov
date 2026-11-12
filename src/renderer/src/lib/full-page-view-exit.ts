import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import type { TopLevelView } from '../../../shared/ui-chrome-types'

type FullPageView = Exclude<TopLevelView, 'terminal'>

// Each page's own close keeps its back/forward history and page state consistent.
const CLOSE_FULL_PAGE: Record<FullPageView, (state: AppState) => void> = {
  settings: (state) => state.closeSettingsPage(),
  tasks: (state) => state.closeTaskPage(),
  activity: (state) => state.closeActivityPage(),
  automations: (state) => state.closeAutomationsPage(),
  space: (state) => state.closeSpacePage(),
  skills: (state) => state.closeSkillsPage(),
  artifacts: (state) => state.closeArtifactsPage(),
  mobile: (state) => state.closeMobilePage()
}

export function isFullPageView(view: TopLevelView): view is FullPageView {
  return view !== 'terminal' && view in CLOSE_FULL_PAGE
}

/** Leaves every full page (Tasks, Settings, …) so a surface that replaces them, like the board, shows alone. */
export function closeFullPageViews(): void {
  // Why: a page can return to the page it was opened from, so unwind until the workspace view shows.
  for (let step = 0; step < Object.keys(CLOSE_FULL_PAGE).length; step += 1) {
    const state = useAppStore.getState()
    const view = state.activeView
    if (!isFullPageView(view)) {
      return
    }
    CLOSE_FULL_PAGE[view](state)
    if (useAppStore.getState().activeView === view) {
      return
    }
  }
}
