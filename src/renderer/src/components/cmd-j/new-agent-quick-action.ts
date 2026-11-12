import { MessageSquarePlus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { resolveTerminalAgentTabShortcut } from '@/components/terminal-agent-tab-shortcut'
import { launchAgentTabShortcut } from '@/components/agent-tab-shortcut-launch'
import type { CmdJQuickAction } from './quick-actions'
import { getWorkspaceScopedActionAvailability } from './quick-action-context'

/** Opens the default agent in a new tab, exactly as the new-agent-tab shortcut does. */
export function getNewAgentQuickAction(): CmdJQuickAction {
  return {
    id: 'new-agent-tab',
    kind: 'action',
    title: translate('worktreeJumpPalette.start.newAgent', 'New agent'),
    description: translate(
      'worktreeJumpPalette.start.newAgentDescription',
      'Open your default agent in a new tab.'
    ),
    icon: MessageSquarePlus,
    verbKeywords: [],
    isAvailable: getWorkspaceScopedActionAvailability,
    run: async (ctx) => {
      const availability = getWorkspaceScopedActionAvailability(ctx)
      if (!availability.available) {
        return { status: 'unavailable', reason: availability.reason }
      }
      const worktreeId = ctx.activeWorktreeId
      if (!worktreeId) {
        return { status: 'unavailable', reason: 'no-active-workspace' }
      }
      const shortcut = resolveTerminalAgentTabShortcut({
        activeWorktreeId: worktreeId,
        keybindings: {},
        matchShortcut: (actionId) => actionId === 'tab.newAgent'
      })
      launchAgentTabShortcut(
        worktreeId,
        shortcut,
        () => useAppStore.getState().activeWorktreeId === worktreeId
      )
      return { status: 'ok' }
    }
  }
}
