import { createAdaptorServer } from '@hono/node-server'
import type { ChatPlatform } from './chat/chat-platform.js'
import { createFakeChatPlatform } from './chat/fake-chat-platform.js'
import { createSlackPlatform } from './chat/slack-platform.js'
import { loadConnectorConfig } from './config.js'
import { openConnectorDatabase } from './connector-schema.js'
import { createConnectorApp } from './connector-server.js'
import { createConnectorTokenVerifier } from './connector-token-verifier.js'

const DELIVERY_SWEEP_MS = 5_000
const STALE_SWEEP_MS = 60 * 60_000

const config = loadConnectorConfig()
const database = await openConnectorDatabase({
  ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  dataDir: config.dataDir,
  poolMax: config.databasePoolMax
})
const fakeChat = config.chat.kind === 'fake' ? createFakeChatPlatform() : null
const chat: ChatPlatform | null =
  config.chat.kind === 'slack' ? createSlackPlatform(config.chat) : fakeChat
const { app, router, sweepDeliveries, sweepStale } = createConnectorApp({
  config,
  database,
  chat,
  verifyToken: createConnectorTokenVerifier({ issuer: config.authIssuer, jwksUrl: config.jwksUrl })
})
fakeChat?.register(app)

function logSweepFailure(error: unknown) {
  console.warn(JSON.stringify({ event: 'markov_connector_sweep_failed', message: String(error) }))
}
const deliverySweep = setInterval(() => sweepDeliveries().catch(logSweepFailure), DELIVERY_SWEEP_MS)
const staleSweep = setInterval(() => sweepStale().catch(logSweepFailure), STALE_SWEEP_MS)
deliverySweep.unref()
staleSweep.unref()

const server = createAdaptorServer({ fetch: app.fetch })
server.listen(config.port, () => {
  console.log(
    `[markov-connector] listening on ${config.publicUrl} (port ${config.port}, chat ${config.chat.kind}, database ${database.dialect})`
  )
})
await chat?.start((event) => router.onChat(event))

async function shutdown() {
  clearInterval(deliverySweep)
  clearInterval(staleSweep)
  await chat?.stop()
  server.close()
  await database.close()
  process.exit(0)
}
process.once('SIGTERM', () => void shutdown())
process.once('SIGINT', () => void shutdown())
