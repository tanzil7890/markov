import { loadSharingConfig } from './config.js'
import { openSharingDatabase } from './sharing-database.js'
import { createSharingServer } from './sharing-server.js'

const SWEEP_INTERVAL_MS = 10 * 60_000

const config = loadSharingConfig()
const database = await openSharingDatabase({
  ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  dataDir: config.dataDir,
  poolMax: config.databasePoolMax,
  applicationName: 'markov-sharing'
})
const { server, sweep } = createSharingServer({ config, database })

const sweepTimer = setInterval(() => {
  sweep().catch((error: unknown) =>
    console.warn(JSON.stringify({ event: 'markov_sharing_sweep_failed', message: String(error) }))
  )
}, SWEEP_INTERVAL_MS)
sweepTimer.unref()

server.listen(config.port, () => {
  console.log(
    `[markov-sharing] listening on ${config.publicUrl} (port ${config.port}, database ${database.dialect})`
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
