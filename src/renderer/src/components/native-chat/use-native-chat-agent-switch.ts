import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { getAgentLabel } from '@/lib/agent-catalog'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { structuredChatTabById } from '@/lib/structured-chat-tab-index'
import { buildAgentSessionContinuationPrompt } from '@/lib/agent-session-continuation'
import {
  readChatCapableAgents,
  savedChatModelSelection
} from '@/lib/agent-session/launch/chat-capable-agents'
import { launchAgentSessionContinuation } from '@/lib/agent-session/launch/continuation/launch-agent-session-continuation'
import { launchAgentInNewTab } from '@/lib/agent-session/launch/new-tab/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-session/launch/routing/agent-launch-request-id'
import { adoptAgentSessionLaunchVerdict } from '@/lib/agent-session/launch/routing/agent-session-launch-plan'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'
import { recordHostModelCatalogSnapshot } from '@/runtime/host-model-catalog-snapshots'
import { structuredAgentSessionHostKey } from '@/runtime/structured-agent-session-host-capability'
import type { AgentSessionModelCatalogResult } from '../../../../shared/agent-session/agent-session-wire'
import { isTuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent-config'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { SessionOptionOtherAgents } from '../../../../shared/native-chat/input/native-chat-session-options'
import { structuredAgentSessionDraftScopeKey } from './native-chat-composer-draft-store'
import { readNativeChatContinuationSource } from './native-chat-continuation-source'
import { createNativeChatFileLinkContextSelector } from './native-chat-file-link'
import { captureNativeChatComposerFocusIntent } from './use-native-chat-composer-reveal-focus'
import { firstFrameModelChoices } from './structured-agent-session-option-first-frame'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'

type SwitchPane = Pick<
  NativeChatStructuredViewProps,
  'tabId' | 'groupId' | 'sessionId' | 'target' | 'agent'
>

// Hosts and agents already asked for a list this session; an agent that cannot list is not asked again.
const demandedLists = new Set<string>()

/** The chat's workspace, when it runs on the host that workspace launches on. */
function switchDirectory(pane: SwitchPane) {
  const directory = createNativeChatFileLinkContextSelector(pane.tabId)(useAppStore.getState())
  const environmentId = pane.target.kind === 'environment' ? pane.target.environmentId : null
  return directory && directory.runtimeEnvironmentId === environmentId ? directory : null
}

/** Lets the model picker move this chat to another agent: an unused chat is replaced where it
 *  stands, a used one continues in a chat opened beside it with this chat's context. */
export function useNativeChatAgentSwitch(args: {
  pane: SwitchPane
  session: { messages: readonly NativeChatMessage[]; epoch: string | null }
}): SessionOptionOtherAgents | undefined {
  const { pane, session } = args
  const moving = useRef(false)
  const used = (): boolean => session.messages.some((message) => message.role === 'user')

  const list = useLatestHandler(() => {
    const directory = switchDirectory(pane)
    const agents = directory
      ? readChatCapableAgents(useAppStore.getState(), directory.worktreeId)
          .opens.filter((agent) => agent !== pane.agent)
          .map((agent) => ({
            agent,
            label: getAgentLabel(agent),
            choices: firstFrameModelChoices(agent, pane.target, directory.worktreeId)
          }))
      : []
    return { agents, continuesBeside: used() }
  })

  const [listsRead, setListsRead] = useState(0)
  const demand = useLatestHandler(() => {
    const directory = switchDirectory(pane)
    const unlisted = list().agents.filter(({ agent, choices }) => {
      const key = `${structuredAgentSessionHostKey(pane.target)}\u0000${agent}`
      const ask = choices.length === 0 && !demandedLists.has(key)
      if (ask) {
        demandedLists.add(key)
      }
      return ask
    })
    if (!directory || unlisted.length === 0) {
      return
    }
    void Promise.all(
      unlisted.map(({ agent }) =>
        callStructuredAgentSession<AgentSessionModelCatalogResult>(
          pane.target,
          'agentSession.modelCatalog',
          { agent, worktree: directory.worktreeId, waitForListing: true }
        )
          .then((catalog) =>
            recordHostModelCatalogSnapshot(pane.target, agent, directory.worktreeId, catalog)
          )
          .catch(() => undefined)
      )
    ).then(() => setListsRead((count) => count + 1))
  })

  const pick = useLatestHandler((agent: string, model: string | null) => {
    const directory = switchDirectory(pane)
    if (!directory || !isTuiAgent(agent) || !isTuiAgent(pane.agent) || moving.current) {
      return
    }
    const state = useAppStore.getState()
    const chatSessionOptions = model
      ? savedChatModelSelection(state.settings, agent, model)
      : undefined
    const executionHostId = executionHostIdForStructuredTarget(pane.target)
    const refuse = (): void => {
      toast.error(
        translate(
          'components.agentSessionContinuation.launchFailed',
          'Could not start a new {{agent}} session.',
          { agent: getAgentLabel(agent) }
        )
      )
    }
    if (!used()) {
      const opened = launchAgentInNewTab({
        agentSessionLaunchPlan: adoptAgentSessionLaunchVerdict({
          route: 'structured-native-chat',
          requestedSurface: 'chat',
          requestId: newAgentLaunchRequestId(),
          agent,
          worktreeId: directory.worktreeId,
          executionHostId,
          // The text already typed goes with the chat it was typed for.
          draftFromScope: structuredAgentSessionDraftScopeKey(pane.sessionId),
          ...(chatSessionOptions ? { chatLaunchOptions: chatSessionOptions } : {})
        }),
        agent,
        worktreeId: directory.worktreeId,
        ...(pane.groupId ? { groupId: pane.groupId } : {}),
        afterTabId: pane.tabId,
        focusIntent: captureNativeChatComposerFocusIntent(),
        launchSource: 'native_chat'
      })
      if (opened) {
        state.closeUnifiedTab(pane.tabId)
      } else {
        refuse()
      }
      return
    }
    if (!session.epoch) {
      refuse()
      return
    }
    moving.current = true
    void continueWith(pane, pane.agent, agent, directory, session, chatSessionOptions)
      .catch((error) => {
        console.error('Could not continue the chat with another agent', error)
        refuse()
      })
      .finally(() => {
        moving.current = false
      })
  })

  const ownLabel = isTuiAgent(pane.agent) ? getAgentLabel(pane.agent) : null
  return useMemo(
    // Why listsRead: a list that arrived gives the picker a new surface, so it draws the models.
    () => (ownLabel ? { ownLabel, list, demand, pick, listsRead } : undefined),
    [ownLabel, list, demand, pick, listsRead]
  )
}

async function continueWith(
  pane: SwitchPane,
  sourceAgent: TuiAgent,
  agent: TuiAgent,
  directory: NonNullable<ReturnType<typeof switchDirectory>>,
  session: { messages: readonly NativeChatMessage[]; epoch: string | null },
  chatSessionOptions: Record<string, string> | undefined
): Promise<void> {
  const tab = structuredChatTabById(
    useAppStore.getState().unifiedTabsByWorktree,
    directory.worktreeId,
    pane.tabId
  )
  const source = await readNativeChatContinuationSource({
    pane,
    agent: sourceAgent,
    directory,
    epoch: session.epoch ?? '',
    title: tab?.customLabel?.trim() || tab?.label,
    messages: session.messages,
    wanted: () => true
  })
  const prompt =
    source === 'superseded' ? null : buildAgentSessionContinuationPrompt(source, 'focused')
  if (!prompt) {
    toast.error(
      translate(
        'components.agentSessionContinuation.noContext',
        'No session context is available to continue in a new session.'
      )
    )
    return
  }
  await launchAgentSessionContinuation({
    agent,
    prompt,
    worktreeId: directory.worktreeId,
    groupId: pane.groupId,
    afterTabId: pane.tabId,
    initialCwd: directory.worktreePath,
    launchChoice: {
      agent,
      route: 'structured-native-chat',
      requestedSurface: 'chat',
      executionHostId: executionHostIdForStructuredTarget(pane.target)
    },
    launchSource: 'native_chat',
    ...(chatSessionOptions ? { chatSessionOptions } : {})
  })
}
