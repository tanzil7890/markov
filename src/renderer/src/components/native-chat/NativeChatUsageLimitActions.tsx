import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { translate } from '@/i18n/i18n'
import { ClaudeSwitcherMenu } from '@/components/status-bar/ClaudeSwitcherMenu'
import { ProviderAccountChatButton } from '@/components/status-bar/ProviderAccountChatButton'
import { callStructuredAgentSession } from '@/runtime/structured-agent-session-client'
import type { AgentSessionOptionsResult } from '../../../../shared/agent-session/options/agent-session-options-result'
import { executionHostIdForStructuredTarget } from '@/runtime/structured-agent-session-owner'
import {
  NativeChatMarkovStopContext,
  type NativeChatMarkovStopView
} from './native-chat-markov-stop-context'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'

type UsageLimitActions = { account: ReactNode }
const UsageLimitActionsContext = createContext<UsageLimitActions | null>(null)

export function NativeChatUsageLimitActionsProvider({
  pane,
  view,
  recovery,
  children
}: {
  pane: Omit<NativeChatStructuredViewProps, 'mode'>
  view: NativeChatMarkovStopView
  recovery: {
    readCurrent: boolean
    canSwitchAccount: boolean | undefined
    epoch?: string | null
  }
  children: ReactNode
}): React.JSX.Element {
  const canSwitchAccount = recovery.canSwitchAccount
  const active = view.usageLimitTurnItemId !== null
  const intentKey = JSON.stringify([
    executionHostIdForStructuredTarget(pane.target),
    pane.sessionId,
    pane.agent,
    recovery.epoch,
    view.usageLimitTurnItemId,
    recovery.readCurrent,
    pane.isVisible
  ])
  const intent = useRef<{ key: string } | null>(null)
  useLayoutEffect(() => {
    const current = { key: intentKey }
    intent.current = current
    return () => {
      if (intent.current === current) {
        intent.current = null
      }
    }
  }, [intentKey])
  let account: ReactNode = null
  if (pane.agent === 'claude' && active && pane.isVisible) {
    if (canSwitchAccount === undefined) {
      account = <ProviderAccountChatButton provider="claude" target={pane.target} disabled />
    } else if (canSwitchAccount) {
      account = (
        <ClaudeSwitcherMenu
          key={executionHostIdForStructuredTarget(pane.target)}
          claude={null}
          compact
          iconOnly
          chatAction={{
            target: pane.target,
            canSwitch: async () => {
              const current = intent.current
              if (!current || !active) {
                return false
              }
              const result = await callStructuredAgentSession<AgentSessionOptionsResult>(
                pane.target,
                'agentSession.options',
                { sessionId: pane.sessionId }
              )
              return intent.current === current && result.canSwitchAccount === true
            }
          }}
        />
      )
    }
  }
  const actions = useMemo<UsageLimitActions>(() => ({ account }), [account])
  const stopView = useMemo(
    () => ({
      ...view,
      continueUsageLimit: (hadFocus?: boolean) => {
        // A new intent drops any account check still in flight for the stop being continued.
        intent.current = { key: intentKey }
        view.continueUsageLimit(hadFocus)
      }
    }),
    [intentKey, view]
  )
  return (
    <UsageLimitActionsContext.Provider value={actions}>
      <NativeChatMarkovStopContext.Provider value={stopView}>
        {children}
      </NativeChatMarkovStopContext.Provider>
    </UsageLimitActionsContext.Provider>
  )
}

export function NativeChatUsageLimitActions(): React.JSX.Element | null {
  const actions = useContext(UsageLimitActionsContext)
  if (!actions?.account) {
    return null
  }
  return (
    <div className="ml-6 flex flex-wrap items-center gap-2 text-chat-foreground-faint">
      <p className="text-xs">
        {translate(
          'components.native-chat.usageLimitActions.leadIn',
          'Continue this chat without waiting:'
        )}
      </p>
      <div className="w-32 shrink-0 empty:hidden">{actions.account}</div>
    </div>
  )
}
