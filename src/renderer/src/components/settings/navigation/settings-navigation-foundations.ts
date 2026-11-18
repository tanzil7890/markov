import type { MutableRefObject } from 'react'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import type { SpeechModelState } from '../../../../../shared/speech-types'
import type { SourceControlAiSettings } from '../../../../../shared/source-control/ai/settings/source-control-ai-settings-types'
import { normalizeSourceControlAiSettings } from '../../../../../shared/source-control/ai/settings/source-control-ai-settings'
import { getDefaultVoiceSettings } from '../../../../../shared/constants'
import type { SettingsNavTarget } from '@/lib/settings-navigation-types'
import type { SettingsDeepLinkTargetWatch } from './settings-deep-link-target-watcher'

export const SHORTCUTS_ESCAPE_CONFIRM_TOAST_ID = 'shortcuts-escape-confirm'
export const SHORTCUTS_ESCAPE_CONFIRM_WINDOW_MS = 2200
export const SETTINGS_TARGET_HIGHLIGHT_MS = 3_000

export function getSettingsSectionId(
  pane: SettingsNavTarget,
  repoId: string | null,
  repoIdToRepresentative: Map<string, string>
): string {
  if (pane === 'repo' && repoId) {
    // Each project has one pane; map every host’s repo ID to its representative.
    return `repo-${repoIdToRepresentative.get(repoId) ?? repoId}`
  }
  return pane
}

export function hasReadyVoiceModel(
  settings: GlobalSettings,
  modelStates: readonly SpeechModelState[]
): boolean {
  const voiceSettings = settings.voice ?? getDefaultVoiceSettings()
  if (
    voiceSettings.sttModel !== '' &&
    modelStates.some((state) => state.id === voiceSettings.sttModel && state.status === 'ready')
  ) {
    return true
  }
  return modelStates.some((state) => state.status === 'ready')
}

export function getSettingsScrollTarget(
  sectionId: string,
  container?: HTMLElement | null
): HTMLElement | null {
  return (
    container?.querySelector<HTMLElement>(`[data-settings-section="${CSS.escape(sectionId)}"]`) ??
    document.getElementById(sectionId)
  )
}

export function scrollSubsectionIntoView(targetId: string, container?: HTMLElement | null): void {
  // Whole-pane swaps need inner scrolling only when the pane exceeds the viewport.
  const target = getSettingsScrollTarget(targetId, container)
  if (!target) {
    return
  }
  if (!container) {
    target.scrollIntoView({ block: 'start' })
    return
  }
  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTop = targetRect.top - containerRect.top + container.scrollTop
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
  container.scrollTo({ top: Math.min(Math.max(0, targetTop - 16), maxScrollTop) })
}

export function readSourceControlAiSettings(settings: GlobalSettings): SourceControlAiSettings {
  return normalizeSourceControlAiSettings(settings.sourceControlAi, settings.commitMessageAi)
}

export function cancelPendingSettingsSubsectionScrollFrame(
  frameRef: MutableRefObject<number | null>
): void {
  if (frameRef.current !== null) {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }
}

export function cancelPendingSettingsDeepLinkTargetWatch(
  watchRef: MutableRefObject<SettingsDeepLinkTargetWatch | null>
): void {
  watchRef.current?.cancel()
  watchRef.current = null
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
