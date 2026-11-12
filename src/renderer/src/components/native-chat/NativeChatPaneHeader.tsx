import { Fragment, useCallback } from 'react'
import { MessageSquarePlus, SquareSplitVertical } from 'lucide-react'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { agentForksConversations } from '../../../../shared/agent-launch/startup/agent-resume-argv'
import type { NativeChatTabSession } from '../tab-bar/tab-session-history-switch'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { useStructuredChatPaneActions } from './use-structured-chat-pane-actions'
import { NativeChatResumeInCliButton } from './NativeChatResumeInCliButton'
import { NativeChatSettingsButton } from './NativeChatSettingsButton'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import type { NativeChatHandOff } from './use-native-chat-hand-off'
import { setNativeChatPaneSlot } from './native-chat-pane-slots'

// Why inherit: the labelled actions read in the chat's font, not the terminal title's mono.
const HEADER_STYLE: React.CSSProperties & Record<'--markov-pane-title-bg', string> = {
  '--markov-pane-title-bg': 'var(--chat-canvas)',
  fontFamily: 'inherit'
}

export type NativeChatHeaderHandOff = { open: () => void; disabled: boolean }

export function NativeChatPaneHeader({
  tabId,
  worktreeId,
  groupId,
  nativeChat,
  focused,
  colorScheme,
  handOff
}: {
  tabId: string
  worktreeId: string
  groupId: string
  nativeChat: NativeChatTabSession
  focused: boolean
  colorScheme: React.CSSProperties['colorScheme']
  handOff?: NativeChatHeaderHandOff
}): React.JSX.Element {
  const actions = useStructuredChatPaneActions(tabId, worktreeId, groupId)
  const workspaceSlotRef = useCallback(
    (element: HTMLDivElement | null) => setNativeChatPaneSlot('header-workspace', tabId, element),
    [tabId]
  )
  const documentDark = useDocumentDarkTheme()
  const light = colorScheme ? colorScheme === 'light' : !documentDark
  const split = translate(
    'auto.components.terminal.pane.TerminalContextMenu.20e565d865',
    'Split Terminal Right'
  )
  const splitShortcutCombos = useShortcutKeyComboDetails('terminal.splitRight')
  const handOffLabel = translate(
    'components.agentSessionContinuation.handOffToAnotherAgent',
    'Hand Off to Another Agent'
  )
  return (
    <div
      className="pane-title-bar z-20"
      data-active-pane={focused ? '' : undefined}
      data-pane-title-surface={light ? 'light' : 'dark'}
      style={HEADER_STYLE}
    >
      <div ref={workspaceSlotRef} className="flex min-w-0 flex-1 items-center" />
      <div className="pane-title-actions ml-auto flex shrink-0 items-center gap-0">
        {handOff && focused ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="pane-title"
                size="xs"
                aria-label={handOffLabel}
                disabled={handOff.disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  handOff.open()
                }}
              >
                <MessageSquarePlus className="size-3" />
                <span>{translate('components.native-chat.header.handOff', 'Hand off')}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {handOffLabel}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {nativeChat.agent && agentForksConversations(nativeChat.agent) ? (
          <NativeChatResumeInCliButton
            tabId={tabId}
            worktreeId={worktreeId}
            nativeChat={nativeChat}
          />
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="pane-title"
              size="xs"
              aria-label={split}
              data-contextual-tour-target={focused ? 'chat-pane-split-target' : undefined}
              onClick={(event) => {
                event.stopPropagation()
                actions.onSplitRight()
              }}
            >
              <SquareSplitVertical className="size-3" />
              <span>{translate('components.native-chat.header.split', 'Split')}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <span className="inline-flex items-center gap-1.5">
              <span>
                {split}
                {splitShortcutCombos.length > 0 ? ': ' : null}
              </span>
              {splitShortcutCombos.map((shortcut, index) => (
                <Fragment key={JSON.stringify([shortcut.keys, shortcut.doubleTap])}>
                  {index > 0 ? <span>{', '}</span> : null}
                  <ShortcutKeyCombo
                    keys={shortcut.keys}
                    doubleTap={shortcut.doubleTap}
                    className="gap-0.5"
                    keyCapClassName="min-w-0 border-background/30 bg-background/10 px-1 py-0 text-3xs text-background shadow-none"
                    separatorClassName="mx-0 text-3xs text-background/70"
                  />
                </Fragment>
              ))}
            </span>
          </TooltipContent>
        </Tooltip>
        <NativeChatSettingsButton />
      </div>
    </div>
  )
}

export function nativeChatPaneHeader(
  view: Pick<
    NativeChatStructuredViewProps,
    | 'tabId'
    | 'groupId'
    | 'sessionId'
    | 'agent'
    | 'isVisible'
    | 'isFocusedGroup'
    | 'contextMenuActions'
  >,
  worktreeId: string | null,
  colorScheme: React.CSSProperties['colorScheme'],
  handOff?: NativeChatHandOff
): React.JSX.Element | null {
  return view.isVisible && worktreeId && view.groupId && !view.contextMenuActions ? (
    <NativeChatPaneHeader
      tabId={view.tabId}
      worktreeId={worktreeId}
      groupId={view.groupId}
      nativeChat={{ sessionId: view.sessionId, agent: view.agent }}
      focused={view.isFocusedGroup}
      colorScheme={colorScheme}
      handOff={
        handOff?.available
          ? { open: handOff.open, disabled: handOff.preparing || handOff.dialog !== null }
          : undefined
      }
    />
  ) : null
}
