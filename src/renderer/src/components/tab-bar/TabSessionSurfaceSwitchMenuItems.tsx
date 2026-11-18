import type { TerminalTab } from '../../../../shared/workspace-layout/terminal-tab-types'
import { CliChatResumeMenuItems } from './CliChatResumeMenuItems'
import type { NativeChatTabSession } from './tab-session-history-switch'

export function TabSessionSurfaceSwitchMenuItems(props: {
  tab: Pick<TerminalTab, 'id' | 'worktreeId'>
  nativeChat?: NativeChatTabSession
  leadingSeparator: boolean
  onComplete?: () => void
}): React.JSX.Element | null {
  // A chat tab offers no surface switch; a terminal agent tab can continue in Chat UI.
  return props.nativeChat ? null : <CliChatResumeMenuItems {...props} />
}
