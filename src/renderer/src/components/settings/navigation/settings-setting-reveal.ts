import { motionSafeScrollBehavior } from '@/hooks/usePrefersReducedMotion'
import { watchForSettingsDeepLinkTarget } from './settings-deep-link-target-watcher'
import {
  getSettingsScrollTarget,
  scrollSubsectionIntoView,
  SETTINGS_TARGET_HIGHLIGHT_MS
} from './settings-navigation-foundations'

const SETTINGS_REVEALED_ATTRIBUTE = 'data-settings-revealed'

export type SettingsRevealTarget = {
  sectionId: string
  /** The setting to find inside the section; without one only the section is brought into view. */
  setting?: { targetId?: string; title: string }
}

// Why offsetParent: a row in a pane that is still hidden cannot be scrolled to.
function onScreen(container: HTMLElement, element: HTMLElement | null): HTMLElement | null {
  return element && container.contains(element) && element.offsetParent !== null ? element : null
}

function findSetting(container: HTMLElement, target: SettingsRevealTarget): HTMLElement | null {
  const { setting } = target
  if (!setting) {
    return null
  }
  return onScreen(
    container,
    (setting.targetId ? getSettingsScrollTarget(setting.targetId, container) : null) ??
      container.querySelector<HTMLElement>(`[data-setting-title="${CSS.escape(setting.title)}"]`)
  )
}

/** Brings a section, and the setting picked from search inside it, into view once they mount.
 *  The setting is marked briefly; a row that never appears leaves the section in view. */
export function revealInSettings(
  container: HTMLElement | null,
  target: SettingsRevealTarget
): () => void {
  if (!container) {
    return () => {}
  }
  let clearMark: number | null = null
  let marked: HTMLElement | null = null
  let sectionShown = false
  /** True once there is nothing left to wait for. */
  const reveal = (): boolean => {
    if (
      !sectionShown &&
      onScreen(container, getSettingsScrollTarget(target.sectionId, container))
    ) {
      sectionShown = true
      scrollSubsectionIntoView(target.sectionId, container)
    }
    const row = findSetting(container, target)
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: motionSafeScrollBehavior('smooth') })
      row.setAttribute(SETTINGS_REVEALED_ATTRIBUTE, '')
      marked = row
      clearMark = window.setTimeout(() => {
        row.removeAttribute(SETTINGS_REVEALED_ATTRIBUTE)
        marked = null
      }, SETTINGS_TARGET_HIGHLIGHT_MS)
    }
    return row !== null || (sectionShown && !target.setting)
  }
  let watch: { cancel: () => void } | null = null
  const watchUntilRevealed = (): void => {
    if (reveal()) {
      return
    }
    watch = watchForSettingsDeepLinkTarget({
      root: container,
      // The section mounts first and its rows can follow, so each arrival is a step.
      isTargetPresent: () =>
        findSetting(container, target) !== null ||
        (!sectionShown &&
          onScreen(container, getSettingsScrollTarget(target.sectionId, container)) !== null),
      onTargetPresent: watchUntilRevealed
    })
  }
  watchUntilRevealed()
  return () => {
    watch?.cancel()
    if (clearMark !== null) {
      window.clearTimeout(clearMark)
    }
    marked?.removeAttribute(SETTINGS_REVEALED_ATTRIBUTE)
  }
}
