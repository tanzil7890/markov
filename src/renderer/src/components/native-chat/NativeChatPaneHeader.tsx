import { useCallback, useRef } from 'react'
import { ChevronDown, PanelLeftClose, PanelRightClose, SquareSplitVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { useStructuredChatPaneActions } from './use-structured-chat-pane-actions'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import { setNativeChatPaneSlot } from './native-chat-pane-slots'

// Why inherit: the labelled actions read in the chat's font, not the terminal title's mono.
const HEADER_STYLE: React.CSSProperties & Record<'--markov-pane-title-bg', string> = {
  '--markov-pane-title-bg': 'var(--chat-canvas)',
  fontFamily: 'inherit'
}

export function NativeChatPaneHeader({
  tabId,
  worktreeId,
  groupId,
  focused,
  colorScheme
}: {
  tabId: string
  worktreeId: string
  groupId: string
  focused: boolean
  colorScheme: React.CSSProperties['colorScheme']
}): React.JSX.Element {
  const actions = useStructuredChatPaneActions(tabId, worktreeId, groupId)
  const workspaceSlotRef = useCallback(
    (element: HTMLDivElement | null) => setNativeChatPaneSlot('header-workspace', tabId, element),
    [tabId]
  )
  const documentDark = useDocumentDarkTheme()
  const light = colorScheme ? colorScheme === 'light' : !documentDark
  const splitRightShortcut = useOptionalShortcutLabel('terminal.splitRight')
  // Why: a chosen split focuses its new terminal, so the closing menu must not pull focus back.
  const splitChosenRef = useRef(false)
  const runSplit = (split: () => void): void => {
    splitChosenRef.current = true
    split()
  }
  return (
    <div
      className="pane-title-bar z-20"
      data-active-pane={focused ? '' : undefined}
      data-pane-title-surface={light ? 'light' : 'dark'}
      style={HEADER_STYLE}
    >
      <div ref={workspaceSlotRef} className="flex min-w-0 flex-1 items-center" />
      <div className="pane-title-actions ml-auto flex shrink-0 items-center gap-0">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="pane-title"
              size="xs"
              data-contextual-tour-target={focused ? 'chat-pane-split-target' : undefined}
              onClick={(event) => event.stopPropagation()}
            >
              <SquareSplitVertical className="size-3" />
              <span>{translate('components.native-chat.header.split', 'Split')}</span>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            // Portaled content still bubbles React events to the chat, which has its own handlers.
            onClick={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              if (splitChosenRef.current) {
                splitChosenRef.current = false
                event.preventDefault()
              }
            }}
          >
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() => runSplit(actions.onSplitRight)}
            >
              <PanelRightClose />
              {translate(
                'auto.components.terminal.pane.TerminalContextMenu.20e565d865',
                'Split Terminal Right'
              )}
              {splitRightShortcut ? (
                <DropdownMenuShortcut>{splitRightShortcut}</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() => runSplit(actions.onSplitLeft)}
            >
              <PanelLeftClose />
              {translate('components.native-chat.header.splitTerminalLeft', 'Split Terminal Left')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function nativeChatPaneHeader(
  view: Pick<
    NativeChatStructuredViewProps,
    'tabId' | 'groupId' | 'isVisible' | 'isFocusedGroup' | 'contextMenuActions'
  >,
  worktreeId: string | null,
  colorScheme: React.CSSProperties['colorScheme']
): React.JSX.Element | null {
  return view.isVisible && worktreeId && view.groupId && !view.contextMenuActions ? (
    <NativeChatPaneHeader
      tabId={view.tabId}
      worktreeId={worktreeId}
      groupId={view.groupId}
      focused={view.isFocusedGroup}
      colorScheme={colorScheme}
    />
  ) : null
}
