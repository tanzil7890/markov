import { AgentSessionContextCopyMenuItem } from '../terminal-pane/AgentSessionContextCopyMenuItem'
import { useNativeChatQuickCommandsMenu } from './use-native-chat-quick-commands-menu'
import {
  useNativeChatSessionContextActions,
  type NativeChatSessionMenuSource
} from './use-native-chat-session-context-actions'

export function useNativeChatStandaloneMenu({
  pane,
  source,
  close
}: {
  pane: { tabId: string; worktreeId: string; groupId: string } | undefined
  source: NativeChatSessionMenuSource | undefined
  close: () => void
}) {
  const quickCommands = useNativeChatQuickCommandsMenu(pane, close)
  const context = useNativeChatSessionContextActions(source)
  return {
    quickCommands: quickCommands.menu,
    sessionItems:
      pane && source && context.available ? (
        <AgentSessionContextCopyMenuItem disabled={context.pending} onSelect={context.onCopy} />
      ) : null,
    dialogs: quickCommands.dialog
  }
}
