import type { ConnectorConversation } from '@markov-cloud/connector-contract'

// Where to post in the platform (e.g. Slack channel + thread); stored with the conversation.
export type ChatRoute = Record<string, string>

export type ChatThread = { conversation: ConnectorConversation; route: ChatRoute }

export type ChatUser = { id: string; email: string | null }

export type ChatActionKind = 'answer' | 'project'

export type ChatButton = { label: string; value: string; style?: 'primary' | 'danger' }

export type ChatMessage = {
  // Markdown as agents write it; each platform converts to its own format.
  text: string
  actions?: { kind: ChatActionKind; buttons: ChatButton[] }
}

export type ChatInbound =
  | {
      type: 'message'
      thread: ChatThread
      user: ChatUser
      text: string
      // The bot was mentioned or messaged directly, so the text may start a new conversation.
      addressed: boolean
    }
  | {
      type: 'action'
      thread: ChatThread
      user: ChatUser
      kind: ChatActionKind
      value: string
      messageId: string
    }

export type ChatPlatform = {
  readonly name: string
  start(onInbound: (event: ChatInbound) => Promise<void>): Promise<void>
  stop(): Promise<void>
  post(thread: ChatThread, message: ChatMessage): Promise<string>
  update(thread: ChatThread, messageId: string, message: ChatMessage): Promise<void>
}
