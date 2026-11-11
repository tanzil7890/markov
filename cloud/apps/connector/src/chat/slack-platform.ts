import { LogLevel, SocketModeClient } from '@slack/socket-mode'
import { WebClient, type Button, type KnownBlock } from '@slack/web-api'
import type { ChatActionKind, ChatInbound, ChatMessage, ChatPlatform, ChatThread, ChatUser } from './chat-platform.js'

const EMAIL_CACHE_MS = 10 * 60_000
const MAX_TEXT_CHARS = 39_000
const MAX_SECTION_CHARS = 3_000
const MAX_BUTTONS = 25
const ACTION_PREFIX = 'markov_'

type SlackRecord = Record<string, unknown>

function field(record: unknown, key: string): unknown {
  return record && typeof record === 'object' ? (record as SlackRecord)[key] : undefined
}

function text(record: unknown, key: string): string | undefined {
  const value = field(record, key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

// Agents write Markdown; Slack's mrkdwn differs in bold, headings and links, and needs &, <, > escaped.
export function markdownToMrkdwn(markdown: string): string {
  return markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '_$1_')
    .replace(/~~(.+?)~~/g, '~$1~')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<$2|$1>')
}

// Slack sends mentions as <@U123>, links as <url|label> and escapes &, <, >.
function plainText(slackText: string, botUserId: string): string {
  return slackText
    .replaceAll(`<@${botUserId}>`, '')
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2 ($1)')
    .replace(/<(https?:[^>]+)>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

function blocksFor(message: ChatMessage): KnownBlock[] {
  const blocks: KnownBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: truncate(markdownToMrkdwn(message.text), MAX_SECTION_CHARS) } }
  ]
  if (message.actions) {
    const kind = message.actions.kind
    const elements: Button[] = message.actions.buttons.slice(0, MAX_BUTTONS).map((button, index) => ({
      type: 'button',
      action_id: `${ACTION_PREFIX}${kind}_${index}`,
      text: { type: 'plain_text', text: truncate(button.label, 75) },
      value: button.value,
      ...(button.style ? { style: button.style } : {})
    }))
    blocks.push({ type: 'actions', elements })
  }
  return blocks
}

function threadFor(team: string, channel: string, rootTs: string): ChatThread {
  return {
    conversation: { source: 'slack', externalId: `${team}:${channel}:${rootTs}` },
    route: { channel, threadTs: rootTs }
  }
}

export function createSlackPlatform(input: { botToken: string; appToken: string }): ChatPlatform {
  const web = new WebClient(input.botToken)
  const socket = new SocketModeClient({ appToken: input.appToken, logLevel: LogLevel.WARN })
  const emails = new Map<string, { email: string | null; at: number }>()
  let botUserId = ''

  async function userFor(id: string): Promise<ChatUser> {
    const cached = emails.get(id)
    if (cached && Date.now() - cached.at < EMAIL_CACHE_MS) return { id, email: cached.email }
    const info = await web.users.info({ user: id }).catch(() => null)
    const email = info?.user?.profile?.email ?? null
    emails.set(id, { email, at: Date.now() })
    return { id, email }
  }

  async function inboundFromEvent(body: unknown): Promise<ChatInbound | null> {
    const event = field(body, 'event')
    const team = text(body, 'team_id') ?? text(event, 'team')
    const type = text(event, 'type')
    const user = text(event, 'user')
    const channel = text(event, 'channel')
    const ts = text(event, 'ts')
    if (!team || !user || !channel || !ts || user === botUserId) return null
    if (field(event, 'bot_id') !== undefined || field(event, 'subtype') !== undefined) return null
    const raw = text(event, 'text') ?? ''
    const threadTs = text(event, 'thread_ts')
    let addressed: boolean
    if (type === 'app_mention') {
      addressed = true
    } else if (type === 'message' && text(event, 'channel_type') === 'im') {
      addressed = true
    } else if (type === 'message' && threadTs && !raw.includes(`<@${botUserId}>`)) {
      // Thread replies steer an existing conversation; mentions arrive as app_mention instead.
      addressed = false
    } else {
      return null
    }
    return {
      type: 'message',
      thread: threadFor(team, channel, threadTs ?? ts),
      user: await userFor(user),
      text: plainText(raw, botUserId),
      addressed
    }
  }

  async function inboundFromAction(body: unknown): Promise<ChatInbound | null> {
    if (text(body, 'type') !== 'block_actions') return null
    const action = (field(body, 'actions') as unknown[] | undefined)?.[0]
    const actionId = text(action, 'action_id') ?? ''
    const value = text(action, 'value')
    const kind = actionId.slice(ACTION_PREFIX.length).split('_')[0] as ChatActionKind
    const team = text(field(body, 'team'), 'id')
    const user = text(field(body, 'user'), 'id')
    const channel = text(field(body, 'channel'), 'id')
    const message = field(body, 'message')
    const messageTs = text(message, 'ts')
    if (!actionId.startsWith(ACTION_PREFIX) || (kind !== 'answer' && kind !== 'project')) return null
    if (!value || !team || !user || !channel || !messageTs) return null
    return {
      type: 'action',
      thread: threadFor(team, channel, text(message, 'thread_ts') ?? messageTs),
      user: await userFor(user),
      kind,
      value,
      messageId: messageTs
    }
  }

  return {
    name: 'slack',
    async start(onInbound) {
      const auth = await web.auth.test()
      botUserId = auth.user_id ?? ''
      socket.on('slack_event', async ({ ack, type, body, retry_num: retryNum }) => {
        await ack()
        // Slack redelivers when an ack is slow; the first delivery already did the work.
        if (typeof retryNum === 'number' && retryNum > 0) return
        try {
          const inbound =
            type === 'events_api' ? await inboundFromEvent(body) : type === 'interactive' ? await inboundFromAction(body) : null
          if (inbound) await onInbound(inbound)
        } catch (error) {
          console.warn(JSON.stringify({ event: 'markov_connector_slack_event_failed', message: String(error) }))
        }
      })
      await socket.start()
      console.log(`[markov-connector] Slack connected as <@${botUserId}> in team ${auth.team ?? auth.team_id}`)
    },
    async stop() {
      await socket.disconnect().catch(() => {})
    },
    async post(thread, message) {
      const response = await web.chat.postMessage({
        channel: thread.route.channel!,
        thread_ts: thread.route.threadTs!,
        text: truncate(markdownToMrkdwn(message.text), MAX_TEXT_CHARS),
        ...(message.actions ? { blocks: blocksFor(message) } : {})
      })
      if (!response.ts) throw new Error('Slack did not return a message timestamp')
      return response.ts
    },
    async update(thread, messageId, message) {
      await web.chat.update({
        channel: thread.route.channel!,
        ts: messageId,
        text: truncate(markdownToMrkdwn(message.text), MAX_TEXT_CHARS),
        blocks: blocksFor(message)
      })
    }
  }
}
