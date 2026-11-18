import type { AppState } from '@/store/types'
import { chatProviderAgents } from '@/lib/chat-provider-agents'
import { readAgentLaunchChoice, resolveChatProgramContext } from '@/lib/host-chat-program'
import { readDetectedAgentsForWorktree } from '@/lib/agent-detection-target-inventory'
import { worktreeLaunchWorkspace } from '@/lib/agent-session/launch/routing/agent-launch-route-input'
import { readAgentLaunchPreferencesForWorktree } from '@/runtime/agent-launch-settings/use-host-agent-launch-preferences'
import { isOfferedTuiAgent } from '../../../../../shared/agent-launch/catalog/offered-tui-agents'
import { isTuiAgentEnabled } from '../../../../../shared/agent-launch/catalog/tui-agent-selection'
import type { TuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { narrowStructuredLaunchSeedOptions } from '../../../../../shared/native-chat/input/native-chat-session-option-defaults'

export type ChatCapableAgents = {
  /** Agents whose chat opens in this workspace now, the host's built-in ones first. */
  opens: TuiAgent[]
  /** The host has not yet said whether some agent's chat can open. */
  pending: boolean
  executionHostId: string
}

/** Asking for a chat is the user's pick, so an agent set to open as a terminal by default still counts. */
export function readChatCapableAgents(state: AppState, worktreeId: string): ChatCapableAgents {
  const workspace = worktreeLaunchWorkspace(worktreeId)
  const { executionHostId } = resolveChatProgramContext(state, workspace)
  const { disabledTuiAgents } = readAgentLaunchPreferencesForWorktree(state, worktreeId)
  const detected = readDetectedAgentsForWorktree(state, worktreeId)
  const opens: TuiAgent[] = []
  let pending = false
  for (const agent of chatProviderAgents(executionHostId, state.runtimeStatusByEnvironmentId)) {
    if (!isOfferedTuiAgent(agent) || !isTuiAgentEnabled(agent, disabledTuiAgents)) {
      continue
    }
    const { chatEligibility } = readAgentLaunchChoice(state, agent, workspace, detected, 'chat')
    if (chatEligibility === 'opens') {
      opens.push(agent)
    } else if (chatEligibility === 'unresolved') {
      pending = true
    }
  }
  return { opens, pending, executionHostId }
}

/** A model with the effort and speed last used with it, as the selection a launch asks for. */
export function savedChatModelSelection(
  settings: Pick<GlobalSettings, 'nativeChatSessionOptions'> | null | undefined,
  agent: TuiAgent,
  model: string
): Record<string, string> | undefined {
  return narrowStructuredLaunchSeedOptions({
    ...settings?.nativeChatSessionOptions?.[agent]?.valuesByModel?.[model],
    model
  })
}
