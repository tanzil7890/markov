import { createPortal } from 'react-dom'
import { ArrowRight, MessageSquare, TriangleAlert } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { formatAgentTypeLabel } from '../../../../shared/agent-status/presentation/agent-type-label'
import { NATIVE_CHAT_EMPTY_STATE_COPY } from '../../../../shared/native-chat/native-chat-empty-state'
import type { NativeChatSession } from '../../../../shared/native-chat/native-chat-types'

export function NativeChatEmptyState({
  kind,
  message,
  headline,
  agent,
  retrying = false,
  onPickSuggestion,
  workspaceName,
  suggestionSlot
}: {
  kind: 'loading' | 'empty' | 'error' | 'not-agent'
  message?: string
  /** The chat's own sentence for the failure, said once: it takes the generic title's place. */
  headline?: string
  agent?: NativeChatSession['agent']
  /** Structured reads retry automatically; show a loading failure without directing users back to a terminal. */
  retrying?: boolean
  /** Puts a starter prompt in the composer; the user still sends it. */
  onPickSuggestion?: (text: string) => void
  workspaceName?: string
  /** Where the starter prompts go when the composer offers room beneath itself. */
  suggestionSlot?: HTMLElement | null
}): React.JSX.Element {
  const copy = emptyStateCopy(kind, { message, headline }, agent, retrying)
  if (kind === 'empty' && onPickSuggestion) {
    const starters = <StarterPrompts onPick={onPickSuggestion} centersComposer={!!suggestionSlot} />
    return (
      <div className="flex h-full w-full flex-col justify-end px-3 pb-2 sm:px-4">
        <div className="mx-auto flex w-full max-w-(--chat-content-max-width) flex-col gap-1.5 px-1">
          <p className="text-xl font-semibold tracking-tight text-chat-foreground-strong">
            {workspaceName && agent
              ? translate(
                  'components.native-chat.state.empty.heroTitle',
                  'What should {{agent}} do in {{workspace}}?',
                  { agent: formatAgentTypeLabel(agent), workspace: workspaceName }
                )
              : copy.title}
          </p>
          <p className="text-sm text-chat-foreground-faint">
            {workspaceName
              ? translate(
                  'components.native-chat.state.empty.heroSubtitle',
                  'It can read the project, run commands and make changes.'
                )
              : copy.subtitle}
          </p>
          {suggestionSlot ? null : starters}
        </div>
        {suggestionSlot ? createPortal(starters, suggestionSlot) : null}
      </div>
    )
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div
        className={
          kind === 'error'
            ? 'flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive'
            : 'flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground'
        }
      >
        {kind === 'error' ? (
          <TriangleAlert className="size-6" />
        ) : (
          <MessageSquare className="size-6" />
        )}
      </div>
      <p className="text-sm font-medium text-chat-foreground-strong">{copy.title}</p>
      {copy.subtitle ? (
        <p className="max-w-sm text-balance text-xs text-chat-foreground-faint">{copy.subtitle}</p>
      ) : null}
    </div>
  )
}

function StarterPrompts({
  onPick,
  centersComposer
}: {
  onPick: (text: string) => void
  centersComposer: boolean
}): React.JSX.Element {
  return (
    // Why min-h: with the prompts under the composer, this block's height puts the composer mid-pane.
    <div
      className={
        centersComposer ? 'mt-2 flex min-h-[calc(50vh-9rem)] flex-col' : 'mt-2 flex flex-col'
      }
    >
      {starterPrompts().map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onPick(text)}
          className="flex items-center gap-2 border-b border-border px-3 py-2 text-left text-sm text-chat-foreground transition-colors last:border-b-0 hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">{text}</span>
          <ArrowRight className="size-3.5 shrink-0 text-chat-foreground-faint" aria-hidden />
        </button>
      ))}
    </div>
  )
}

function starterPrompts(): string[] {
  return [
    translate(
      'components.native-chat.state.empty.starterExplain',
      'Explain what this project does and how it is laid out'
    ),
    translate(
      'components.native-chat.state.empty.starterRun',
      'Run the app and fix the first thing that breaks'
    ),
    translate(
      'components.native-chat.state.empty.starterImprove',
      'Suggest three improvements, most important first'
    )
  ]
}

function emptyStateCopy(
  kind: 'loading' | 'empty' | 'error' | 'not-agent',
  words: { message?: string; headline?: string },
  agent?: NativeChatSession['agent'],
  retrying = false
): { title: string; subtitle: string | null } {
  switch (kind) {
    case 'loading':
      return {
        title: translate(
          'components.native-chat.state.loading.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.loading.title
        ),
        subtitle: translate(
          'components.native-chat.state.loading.subtitle',
          NATIVE_CHAT_EMPTY_STATE_COPY.loading.subtitle
        )
      }
    case 'error': {
      if (words.headline) {
        return { title: words.headline, subtitle: null }
      }
      return {
        title: translate(
          'components.native-chat.state.error.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.error.title
        ),
        subtitle: retrying
          ? null
          : (words.message ??
            translate(
              'components.native-chat.state.error.subtitle',
              NATIVE_CHAT_EMPTY_STATE_COPY.error.subtitle
            ))
      }
    }
    case 'not-agent':
      return {
        title: translate(
          'components.native-chat.state.notAgent.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.notAgent.title
        ),
        subtitle: translate(
          'components.native-chat.state.notAgent.subtitle',
          NATIVE_CHAT_EMPTY_STATE_COPY.notAgent.subtitle
        )
      }
    case 'empty': {
      const agentName = agent ? formatAgentTypeLabel(agent) : 'the agent'
      return {
        title: translate(
          'components.native-chat.state.empty.title',
          NATIVE_CHAT_EMPTY_STATE_COPY.empty.title,
          { value0: agentName }
        ),
        subtitle: translate(
          'components.native-chat.state.empty.subtitle',
          NATIVE_CHAT_EMPTY_STATE_COPY.empty.subtitle,
          { value0: agentName }
        )
      }
    }
  }
}
