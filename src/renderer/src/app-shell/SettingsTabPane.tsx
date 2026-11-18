import { Suspense, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  isSettingsTabShown,
  resolveSettingsTabGroup,
  settingsTabsAfterGroupChanges
} from '@/lib/settings-tab-placement'
import { persistSettingsTabs } from '@/lib/settings-tab-storage'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { requestNativeChatComposerFocus } from '@/components/native-chat/use-native-chat-composer-reveal-focus'
import { RecoverableRenderErrorBoundary } from '../components/error-boundaries/RecoverableRenderErrorBoundary'
import { RetainedPaneHost } from '../components/tab-group/RetainedPaneHost'

const Settings = lazy(() => import('../components/settings/Settings'))

/** Hands the keyboard back to the tab Settings covered; the strip's own handlers cover tab picks. */
function focusTabUnderSettings(worktreeId: string, groupId: string): void {
  const state = useAppStore.getState()
  const group = (state.groupsByWorktree[worktreeId] ?? []).find((entry) => entry.id === groupId)
  const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (entry) => entry.id === group?.activeTabId
  )
  if (tab?.contentType === 'terminal') {
    focusTerminalTabSurface(tab.entityId, null, { onlyIfFocusUnclaimed: true })
  } else if (tab?.contentType === 'agent-session') {
    requestNativeChatComposerFocus(tab.id, { onlyIfFocusUnclaimed: true })
  }
}

/** Hosts Settings for every workspace's Settings tab. One mount for the whole window, so the
 *  tabs share one Settings (and its unsaved edits); it follows the pane of the tab on screen. */
export function SettingsTabPane({
  workspaceShown
}: {
  /** False while a page or the creation surface covers the workspace view. */
  workspaceShown: boolean
}): React.JSX.Element | null {
  const { anyOpen, worktreeId, groupId, shown, dimmed } = useAppStore(
    useShallow((state) => {
      const anyOpen = Object.keys(state.settingsTabsByWorktree ?? {}).length > 0
      const worktreeId = state.activeWorktreeId
      const group = worktreeId ? resolveSettingsTabGroup(state, worktreeId) : null
      if (!worktreeId || !group) {
        return { anyOpen, worktreeId: null, groupId: undefined, shown: false, dimmed: false }
      }
      return {
        anyOpen,
        worktreeId,
        groupId: group.id,
        shown: isSettingsTabShown(state, worktreeId),
        // Why: pane hosts sit outside their group's DOM, so they take an unfocused split's dim here.
        dimmed:
          (state.groupsByWorktree[worktreeId]?.length ?? 0) > 1 &&
          state.activeGroupIdByWorktree[worktreeId] !== group.id
      }
    })
  )
  const focusGroup = useAppStore((state) => state.focusGroup)
  const visible = shown && workspaceShown
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  // Why a latch: a restored tab nobody has looked at yet must not load Settings at startup.
  const [mounted, setMounted] = useState(false)
  if (visible && !mounted) {
    setMounted(true)
  } else if (!anyOpen && mounted) {
    setMounted(false)
  }

  // Why a subscription: tabs close from many places (strip, shortcut, agent, host), all of which land here.
  useEffect(() => {
    let persisted = useAppStore.getState().settingsTabsByWorktree
    return useAppStore.subscribe((state) => {
      const settled = settingsTabsAfterGroupChanges(state)
      if (settled) {
        useAppStore.setState(settled)
        return
      }
      if (state.settingsTabsByWorktree !== persisted) {
        persisted = state.settingsTabsByWorktree
        persistSettingsTabs(persisted)
      }
    })
  }, [])

  useEffect(() => {
    if (!visible || !worktreeId || groupId === undefined) {
      return
    }
    const surface = surfaceRef.current
    // Why: the covered tab went inert, which drops its focus to <body>.
    if (surface && !surface.contains(document.activeElement)) {
      const searchField = surface.querySelector<HTMLElement>('[data-settings-search-input]')
      ;(searchField ?? surface).focus({ preventScroll: true })
    }
    return () => focusTabUnderSettings(worktreeId, groupId)
  }, [groupId, visible, worktreeId])

  if (!anyOpen) {
    return null
  }
  return (
    <RetainedPaneHost
      groupId={groupId}
      isVisible={visible}
      isSettingsTab
      dimmed={dimmed}
      onFocusOwningGroup={
        worktreeId ? (targetGroupId) => focusGroup(worktreeId, targetGroupId) : undefined
      }
    >
      <div
        ref={surfaceRef}
        tabIndex={-1}
        role="tabpanel"
        data-settings-tab-pane=""
        className="flex min-h-0 min-w-0 flex-1 outline-none"
      >
        {mounted ? (
          <RecoverableRenderErrorBoundary
            boundaryId="settings.tab"
            surface="page"
            title={translate('auto.App.b7a714db1e', 'This page hit an error.')}
            description={translate(
              'auto.App.03a14f6b5b',
              'Retry the page or navigate to another Markov surface.'
            )}
          >
            <Suspense fallback={null}>
              <Settings presentation="tab" visible={visible} />
            </Suspense>
          </RecoverableRenderErrorBoundary>
        ) : null}
      </div>
    </RetainedPaneHost>
  )
}
