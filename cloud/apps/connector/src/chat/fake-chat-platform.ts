import type { Env, Hono } from 'hono'
import { z } from 'zod'
import type { ChatInbound, ChatMessage, ChatPlatform, ChatThread } from './chat-platform.js'

// A loopback-only stand-in for Slack, so tests drive real conversations over HTTP. Config refuses to
// enable it on a non-loopback URL or in production.
const FAKE_PREFIX = '/v1/dev/fake-chat'

const UserSchema = z.object({ id: z.string().min(1), email: z.string().email().nullable() })
const MessageSchema = z.object({
  thread: z.string().min(1).max(64),
  user: UserSchema,
  text: z.string(),
  addressed: z.boolean().default(true)
})
const ActionSchema = z.object({
  thread: z.string().min(1).max(64),
  user: UserSchema,
  kind: z.enum(['answer', 'project']),
  value: z.string().min(1),
  messageId: z.string().min(1)
})

type PostedMessage = ChatMessage & { id: string }

function fakeThread(thread: string): ChatThread {
  return { conversation: { source: 'slack', externalId: `fake:${thread}` }, route: { thread } }
}

export type FakeChatPlatform = ChatPlatform & { register<E extends Env>(app: Hono<E>): void }

export function createFakeChatPlatform(): FakeChatPlatform {
  const threads = new Map<string, PostedMessage[]>()
  let onInbound: ((event: ChatInbound) => Promise<void>) | null = null
  let nextId = 1

  function messages(thread: ChatThread): PostedMessage[] {
    const key = thread.route.thread!
    let list = threads.get(key)
    if (!list) {
      list = []
      threads.set(key, list)
    }
    return list
  }

  return {
    name: 'fake',
    async start(handler) {
      onInbound = handler
    },
    async stop() {
      onInbound = null
    },
    async post(thread, message) {
      const id = `fake-${nextId++}`
      messages(thread).push({ ...message, id })
      return id
    },
    async update(thread, messageId, message) {
      const list = messages(thread)
      const index = list.findIndex((posted) => posted.id === messageId)
      if (index >= 0) list[index] = { ...message, id: messageId }
    },
    register(app) {
      app.post(`${FAKE_PREFIX}/messages`, async (context) => {
        const body = MessageSchema.safeParse(await context.req.json().catch(() => null))
        if (!body.success || !onInbound) return context.json({ error: 'invalid_request' }, 400)
        const { thread, user, text, addressed } = body.data
        await onInbound({ type: 'message', thread: fakeThread(thread), user, text, addressed })
        return context.body(null, 204)
      })
      app.post(`${FAKE_PREFIX}/actions`, async (context) => {
        const body = ActionSchema.safeParse(await context.req.json().catch(() => null))
        if (!body.success || !onInbound) return context.json({ error: 'invalid_request' }, 400)
        const { thread, user, kind, value, messageId } = body.data
        await onInbound({ type: 'action', thread: fakeThread(thread), user, kind, value, messageId })
        return context.body(null, 204)
      })
      app.get(`${FAKE_PREFIX}/threads/:thread`, (context) =>
        context.json({ messages: threads.get(context.req.param('thread')) ?? [] })
      )
    }
  }
}
