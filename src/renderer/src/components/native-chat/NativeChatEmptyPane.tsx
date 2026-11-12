import { useMemo, type RefObject } from 'react'
import { useAppStore } from '@/store'
import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import { NativeChatEmptyState } from './NativeChatEmptyState'
import { NativeChatInstallHero } from './NativeChatInstallHero'
import type { NativeChatInstallSlotState } from './NativeChatInstallSlot'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import { createNativeChatComposerWorkspaceSelector } from './native-chat-composer-workspace'
import { useNativeChatPaneSlot } from './native-chat-pane-slots'

export function NativeChatEmptyPane(props: {
  view: { tabId: string; agent: AgentType }
  slot: NativeChatInstallSlotState
  composer?: RefObject<NativeChatComposerHandle | null>
}): React.JSX.Element {
  const { view, slot, composer } = props
  const selectWorkspace = useMemo(
    () => createNativeChatComposerWorkspaceSelector(view.tabId),
    [view.tabId]
  )
  const workspaceName = useAppStore((state) => selectWorkspace(state).checkout)
  const suggestionSlot = useNativeChatPaneSlot('below-composer', view.tabId)
  return slot.kind === 'install' ? (
    <NativeChatInstallHero slot={slot} agentLabel={structuredAgentLabel(view.agent)} />
  ) : (
    <NativeChatEmptyState
      kind="empty"
      agent={view.agent}
      workspaceName={workspaceName}
      suggestionSlot={suggestionSlot}
      onPickSuggestion={
        composer
          ? (text) => {
              composer.current?.appendText(text)
              composer.current?.focus()
            }
          : undefined
      }
    />
  )
}
