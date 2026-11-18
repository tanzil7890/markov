import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { captureNativeChatComposerFocusIntent } from '@/components/native-chat/use-native-chat-composer-reveal-focus'
import { firstFrameModelChoices } from '@/components/native-chat/structured-agent-session-option-first-frame'
import { resolveDefaultAgentForWorktreeNewTab } from '@/lib/agent-tab-shortcuts'
import { readChatModelUsage } from '@/lib/chat-model-usage'
import {
  readChatCapableAgents,
  savedChatModelSelection
} from '@/lib/agent-session/launch/chat-capable-agents'
import { launchAgentInNewTab } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-session/launch/routing/agent-launch-request-id'
import { readAgentLaunchPreferencesForWorktree } from '@/runtime/agent-launch-settings/use-host-agent-launch-preferences'
import { structuredAgentSessionTargetForHost } from '@/runtime/structured-agent-session-owner'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import { structuredLaunchSeedOptions } from '../../../../shared/native-chat/input/native-chat-session-option-defaults'

type StartingChat = { agent: TuiAgent; chatSessionOptions?: Record<string, string> }

/** The most used agent and model whose chat opens here, else the default agent on its own saved model. */
function startingChat(state: AppState, worktreeId: string): StartingChat | 'pending' | null {
  const { opens, pending, executionHostId } = readChatCapableAgents(state, worktreeId)
  const target = structuredAgentSessionTargetForHost(executionHostId)
  for (const use of readChatModelUsage()) {
    const agent = opens.find((candidate) => candidate === use.agent)
    if (!agent) {
      continue
    }
    const { model } = use
    // A model the saved choice already starts needs no request; one the host stopped listing is skipped.
    if (model === null || structuredLaunchSeedOptions(state.settings, agent)?.model === model) {
      return { agent }
    }
    if (
      target &&
      firstFrameModelChoices(agent, target, worktreeId).some((choice) => choice.value === model)
    ) {
      return { agent, chatSessionOptions: savedChatModelSelection(state.settings, agent, model) }
    }
  }
  const { defaultTuiAgent } = readAgentLaunchPreferencesForWorktree(state, worktreeId)
  const agent = opens.find((candidate) => candidate === defaultTuiAgent) ?? opens[0]
  return agent ? { agent } : pending ? 'pending' : null
}

/** Opens a chat at once on the most used model; `onUnavailable` runs when no agent's chat can open here. */
export function openNewChatFromTabBar(args: {
  worktreeId: string
  groupId: string
  onUnavailable: () => void
}): void {
  const { worktreeId, groupId, onUnavailable } = args
  const focusIntent = captureNativeChatComposerFocusIntent()
  const open = (start: StartingChat | 'pending' | null): void => {
    const launched =
      start && start !== 'pending'
        ? launchAgentInNewTab({
            requestId: newAgentLaunchRequestId(),
            focusIntent,
            requestedSurface: 'chat',
            agent: start.agent,
            worktreeId,
            groupId,
            ...(start.chatSessionOptions ? { chatSessionOptions: start.chatSessionOptions } : {}),
            launchSource: 'tab_bar_quick_launch'
          })
        : null
    if (!launched) {
      focusIntent.cancel()
      onUnavailable()
    }
  }
  const start = startingChat(useAppStore.getState(), worktreeId)
  if (start !== 'pending') {
    open(start)
    return
  }
  void resolveDefaultAgentForWorktreeNewTab(useAppStore.getState, worktreeId)
    .catch(() => null)
    .then(() => {
      const state = useAppStore.getState()
      // Why: a slow host answer must not open a tab in a pane the user has since closed.
      if (state.groupsByWorktree[worktreeId]?.some((group) => group.id === groupId)) {
        open(startingChat(state, worktreeId))
      } else {
        focusIntent.cancel()
      }
    })
}
