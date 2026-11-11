import type { CloudDatabase } from '@markov-cloud/cloud-database'
import {
  CONNECTOR_CONTRACT_VERSION,
  CONNECTOR_LIMITS,
  CONNECTOR_PATHS,
  ConnectorAcksRequestSchema,
  ConnectorEventsRequestSchema,
  ConnectorHelloRequestSchema,
  ConnectorPollRequestSchema,
  ConnectorReplyRequestSchema,
  type ConnectorPollResponse
} from '@markov-cloud/connector-contract'
import { Hono, type Context, type Next } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { z } from 'zod'
import type { ChatPlatform } from './chat/chat-platform.js'
import type { ConnectorConfig } from './config.js'
import { ConnectorRouter } from './connector-router.js'
import type { ConnectorIdentity, ConnectorTokenVerifier } from './connector-token-verifier.js'
import { ConversationStore } from './conversation-store.js'
import { DeliveryQueue, wireDelivery } from './delivery-queue.js'
import { MachineStore, type MachineKey } from './machine-store.js'
import { PollWaiters } from './poll-waiters.js'

const RETENTION_MS = 7 * 24 * 60 * 60_000
// A held poll re-checks this often so lapsed leases go out again without a wake-up.
const POLL_RECHECK_MS = 5_000
// Answer a held poll this long before the connector token it came with expires.
const TOKEN_EXPIRY_MARGIN_MS = 5_000

type ConnectorEnv = { Variables: { identity: ConnectorIdentity } }

export type ConnectorServerDependencies = {
  config: ConnectorConfig
  database: CloudDatabase
  verifyToken: ConnectorTokenVerifier
  chat: ChatPlatform | null
  now?: () => number
}

function readBearer(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, ...rest] = header.split(' ')
  const token = rest.join(' ').trim()
  return scheme?.toLowerCase() === 'bearer' && token.length > 0 ? token : null
}

async function readJson<T extends z.ZodType>(context: Context, schema: T): Promise<z.infer<T> | null> {
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  return parsed.success ? parsed.data : null
}

export function createConnectorApp(dependencies: ConnectorServerDependencies) {
  const { config, database, verifyToken, chat } = dependencies
  const now = dependencies.now ?? Date.now
  const machines = new MachineStore(database, now)
  const deliveries = new DeliveryQueue(database, now)
  const conversations = new ConversationStore(database, now)
  const waiters = new PollWaiters()
  const router = new ConnectorRouter({
    machines,
    deliveries,
    conversations,
    waiters,
    chat,
    now,
    machineOnlineMs: config.machineOnlineMs
  })

  const app = new Hono<ConnectorEnv>()

  app.use('*', async (context, next) => {
    await next()
    context.header('Cache-Control', 'no-store')
    context.header('X-Content-Type-Options', 'nosniff')
    context.header('Referrer-Policy', 'no-referrer')
  })

  const limitBody = bodyLimit({
    maxSize: CONNECTOR_LIMITS.maxRequestBytes,
    onError: (context) => context.json({ error: 'request_too_large' }, 413)
  })

  async function requireToken(context: Context<ConnectorEnv>, next: Next) {
    const token = readBearer(context.req.header('authorization'))
    const identity = token ? await verifyToken(token) : null
    if (!identity) return context.json({ error: 'invalid_token' }, 401)
    context.set('identity', identity)
    await next()
  }

  function machineKey(context: Context<ConnectorEnv>): MachineKey {
    const identity = context.get('identity')
    return { userId: identity.userId, machineId: identity.machineId }
  }

  async function isCurrentHello(key: MachineKey, helloRev: number): Promise<boolean> {
    return (await machines.get(key))?.helloRev === helloRev
  }

  const helloRequired = (context: Context) => context.json({ error: 'hello_required' }, 409)
  const invalidRequest = (context: Context) => context.json({ error: 'invalid_request' }, 400)

  app.get('/healthz', (context) => context.json({ ok: true }))

  app.put(CONNECTOR_PATHS.hello, limitBody, requireToken, async (context) => {
    const hello = await readJson(context, ConnectorHelloRequestSchema)
    if (!hello) return invalidRequest(context)
    if (hello.contract < CONNECTOR_CONTRACT_VERSION) return context.json({ error: 'client_too_old' }, 426)
    const key = machineKey(context)
    const helloRev = await machines.recordHello(key, context.get('identity').email, hello)
    // A poll still held under the previous hello answers 409 now.
    waiters.wake(key)
    return context.json({ helloRev })
  })

  app.post(CONNECTOR_PATHS.poll, limitBody, requireToken, async (context) => {
    const body = await readJson(context, ConnectorPollRequestSchema)
    if (!body) return invalidRequest(context)
    const key = machineKey(context)
    if (!(await isCurrentHello(key, body.helloRev))) return helloRequired(context)
    await machines.touch(key)
    const unsettled = (await machines.claimUnsettledListing(key, body.helloRev))
      ? await deliveries.unsettled(key)
      : undefined
    const tokenLeft = context.get('identity').expiresAt - now() - TOKEN_EXPIRY_MARGIN_MS
    const holdMs = Math.max(0, Math.min(config.pollHoldMs, tokenLeft))
    const deadline = now() + holdMs
    const signal = context.req.raw.signal
    for (;;) {
      if (!(await isCurrentHello(key, body.helloRev))) return helloRequired(context)
      const batch = await deliveries.leaseBatch(key)
      const remaining = deadline - now()
      if (batch.length > 0 || (unsettled && unsettled.length > 0) || remaining <= 0 || signal.aborted) {
        const response: ConnectorPollResponse = {
          v: 1,
          serverNow: now(),
          holdMs,
          ...(unsettled ? { unsettled } : {}),
          deliveries: batch.map(wireDelivery)
        }
        return context.json(response)
      }
      await waiters.wait(key, Math.min(remaining, POLL_RECHECK_MS), signal)
      await machines.touch(key)
    }
  })

  app.post(CONNECTOR_PATHS.acks, limitBody, requireToken, async (context) => {
    const body = await readJson(context, ConnectorAcksRequestSchema)
    if (!body) return invalidRequest(context)
    const key = machineKey(context)
    if (!(await isCurrentHello(key, body.helloRev))) return helloRequired(context)
    for (const ack of body.acks) {
      const settled = await deliveries.applyAck(key, ack)
      if (settled) await router.onDeliveryDone(settled)
    }
    return context.body(null, 204)
  })

  app.post(CONNECTOR_PATHS.events, limitBody, requireToken, async (context) => {
    const body = await readJson(context, ConnectorEventsRequestSchema)
    if (!body) return invalidRequest(context)
    const key = machineKey(context)
    const machine = await machines.get(key)
    if (machine?.helloRev !== body.helloRev) return helloRequired(context)
    // A retried or late batch at or below the mark is already applied.
    if (body.seq <= machine.eventsSeq) return context.body(null, 204)
    await router.onEvents(key, body.events)
    await machines.advanceEventsSeq(key, body.helloRev, body.seq)
    return context.body(null, 204)
  })

  app.post(CONNECTOR_PATHS.replies, limitBody, requireToken, async (context) => {
    const body = await readJson(context, ConnectorReplyRequestSchema)
    if (!body) return invalidRequest(context)
    const result = await router.onReply(machineKey(context), body)
    if (result === 'not_this_hosts_thread') return context.json({ error: 'not_this_hosts_thread' }, 403)
    if (result === 'unavailable') return context.json({ error: 'chat_unavailable' }, 503)
    return context.json(result)
  })

  app.notFound((context) => context.json({ error: 'not_found' }, 404))
  app.onError((error, context) => {
    console.error(JSON.stringify({ event: 'markov_connector_request_failed', message: error.message }))
    return context.json({ error: 'internal_error' }, 500)
  })

  return {
    app,
    router,
    async sweepDeliveries() {
      for (const expired of await deliveries.expireOverdue()) await router.onDeliveryDone(expired)
    },
    async sweepStale() {
      await deliveries.deleteSettledBefore(now() - RETENTION_MS)
      await conversations.deleteStale(now() - RETENTION_MS)
    }
  }
}
