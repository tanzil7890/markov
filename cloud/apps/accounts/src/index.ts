import { createAccountsServer } from './accounts-server.js'
import { openAccountsDatabase } from './accounts-database.js'
import { loadAccountsConfig } from './config.js'
import { createIdentityProvider } from './identity/identity-provider-factory.js'
import { createAccountsTokenSigner } from './accounts-token-signer.js'

const SWEEP_INTERVAL_MS = 10 * 60_000

const config = loadAccountsConfig()
const database = await openAccountsDatabase({
  ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  dataDir: config.dataDir,
  poolMax: config.databasePoolMax,
  applicationName: 'markov-accounts'
})
const signer = await createAccountsTokenSigner({
  issuer: config.issuer,
  relayTtlMs: config.relayTokenTtlMs,
  connectorTtlMs: config.connectorTokenTtlMs,
  now: Date.now,
  ...(config.signingKeyPem ? { signingKeyPem: config.signingKeyPem } : {}),
  ...(config.persistGeneratedSigningKey ? { dataDir: config.dataDir } : {})
})
const { server, sweep } = createAccountsServer({
  config,
  database,
  identity: createIdentityProvider(config),
  signer
})

const sweepTimer = setInterval(() => {
  sweep().catch((error: unknown) =>
    console.warn(JSON.stringify({ event: 'markov_accounts_sweep_failed', message: String(error) }))
  )
}, SWEEP_INTERVAL_MS)
sweepTimer.unref()

server.listen(config.port, () => {
  console.log(
    `[markov-accounts] listening on ${config.publicUrl} (port ${config.port}, identity ${config.identity.kind}, database ${database.dialect})`
  )
})

let stopping = false
const shutdown = (): void => {
  if (stopping) return
  stopping = true
  clearInterval(sweepTimer)
  const deadline = setTimeout(() => process.exit(1), 9_000)
  deadline.unref()
  server.close(() => {
    void database.close().finally(() => {
      clearTimeout(deadline)
    })
  })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
