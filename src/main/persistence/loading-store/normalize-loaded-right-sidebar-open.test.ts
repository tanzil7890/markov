import { homedir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { getDefaultPersistedState } from '../../../shared/constants'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { normalizeLoadedUiState } from './normalize-loaded-ui-state'

it('opens the right sidebar at every start, even when it was closed last time', () => {
  const defaults = getDefaultPersistedState(homedir())
  const closedLastTime: PersistedState = {
    ...defaults,
    ui: { ...defaults.ui, rightSidebarOpen: false },
    settings: { ...defaults.settings, rightSidebarOpenByDefault: false }
  }
  const markNeedsSave = vi.fn()

  const ui = normalizeLoadedUiState(
    closedLastTime,
    defaults,
    defaults.onboarding!,
    false,
    false,
    markNeedsSave
  )

  expect(ui.rightSidebarOpen).toBe(true)
  expect(markNeedsSave).toHaveBeenCalled()
})
