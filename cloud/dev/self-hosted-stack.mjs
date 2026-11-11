// Starts the self-hosted accounts server, relay, sharing and connector servers wired to each other.
// Shared by `pnpm stack` (manual testing) and tests/self-hosted-cloud (end-to-end test),
// so both always boot the stack the same way.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const cloudDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const READY_TIMEOUT_MS = 30_000
const STRIPPED_ENV_PREFIXES = ['MARKOV_RELAY_', 'MARKOV_ACCOUNTS_', 'MARKOV_SHARING_', 'MARKOV_CONNECTOR_', 'SLACK_']

function childEnvironment(base, overrides) {
  const env = { ...base }
  // A stray DATABASE_URL in the caller's shell would otherwise point the relay at the wrong database.
  delete env.DATABASE_URL
  for (const key of Object.keys(env)) {
    if (STRIPPED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) delete env[key]
  }
  return { ...env, ...overrides }
}

function readOrCreateSecret(path) {
  if (existsSync(path)) return readFileSync(path, 'utf8').trim()
  mkdirSync(dirname(path), { recursive: true })
  const secret = randomBytes(48).toString('base64url')
  writeFileSync(path, secret, { mode: 0o600 })
  return secret
}

function startService({ name, appDirectory, env, readyLine, log }) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: join(cloudDirectory, 'apps', appDirectory),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  const forward = (chunk) => {
    const text = chunk.toString()
    output = (output + text).slice(-8_000)
    for (const line of text.split('\n')) if (line.trim()) log(`[${name}] ${line}`)
  }
  child.stdout.on('data', forward)
  child.stderr.on('data', forward)
  const ready = new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${name} did not start:\n${output}`)), READY_TIMEOUT_MS)
    const onData = (chunk) => {
      if (chunk.toString().includes(readyLine)) {
        clearTimeout(timeout)
        child.stdout.off('data', onData)
        child.off('exit', onExit)
        resolveReady()
      }
    }
    const onExit = (code) => {
      clearTimeout(timeout)
      reject(new Error(`${name} exited before it was ready (code ${code}):\n${output}`))
    }
    child.stdout.on('data', onData)
    child.once('exit', onExit)
  })
  return { child, ready }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise((resolveClose) => child.once('close', resolveClose))
  child.kill('SIGTERM')
  const forced = setTimeout(() => child.kill('SIGKILL'), 10_000)
  await closed
  clearTimeout(forced)
}

/**
 * @param {{
 *   host?: string
 *   accountsPort: number
 *   relayPort?: number
 *   dataDir: string
 *   identity?: { kind: 'fake', autoApproveEmail?: string } | { kind: 'clerk', secretKey: string, publishableKey: string }
 *   accountsDatabaseUrl?: string
 *   relayDatabaseUrl?: string
 *   sharingPort?: number
 *   sharingDatabaseUrl?: string
 *   connectorPort?: number
 *   connectorDatabaseUrl?: string
 *   connectorChat?: { kind: 'fake' } | { kind: 'none' } | { kind: 'slack', botToken: string, appToken: string }
 *   env?: NodeJS.ProcessEnv
 *   log?: (line: string) => void
 * }} options
 */
export async function startSelfHostedStack(options) {
  const host = options.host ?? '127.0.0.1'
  const accountsUrl = `http://${host}:${options.accountsPort}`
  const relayUrl = options.relayPort ? `http://${host}:${options.relayPort}` : null
  const identity = options.identity ?? { kind: 'fake' }
  const log = options.log ?? (() => {})
  const baseEnv = options.env ?? process.env
  mkdirSync(options.dataDir, { recursive: true })

  const accounts = startService({
    name: 'accounts',
    appDirectory: 'accounts',
    readyLine: '[markov-accounts] listening',
    log,
    env: childEnvironment(baseEnv, {
      PORT: String(options.accountsPort),
      MARKOV_ACCOUNTS_PUBLIC_URL: accountsUrl,
      MARKOV_ACCOUNTS_DATA_DIR: join(options.dataDir, 'accounts'),
      MARKOV_ACCOUNTS_IDENTITY_PROVIDER: identity.kind,
      ...(identity.kind === 'fake' && identity.autoApproveEmail
        ? { MARKOV_ACCOUNTS_FAKE_AUTO_APPROVE_EMAIL: identity.autoApproveEmail }
        : {}),
      ...(identity.kind === 'clerk'
        ? { CLERK_SECRET_KEY: identity.secretKey, CLERK_PUBLISHABLE_KEY: identity.publishableKey }
        : {}),
      ...(options.accountsDatabaseUrl ? { MARKOV_ACCOUNTS_DATABASE_URL: options.accountsDatabaseUrl } : {})
    })
  })
  try {
    await accounts.ready
  } catch (error) {
    await stopChild(accounts.child)
    throw error
  }

  const jwksUrl = `${accountsUrl}/.well-known/jwks.json`
  const services = []
  if (relayUrl) {
    services.push(
    startService({
      name: 'relay',
      appDirectory: 'relay',
      readyLine: '[markov-relay] listening',
      log,
      env: childEnvironment(baseEnv, {
        PORT: String(options.relayPort),
        MARKOV_RELAY_PUBLIC_URL: relayUrl,
        MARKOV_RELAY_CELL_URL: relayUrl,
        MARKOV_RELAY_AUTH_ISSUER: accountsUrl,
        MARKOV_RELAY_JWKS_URL: jwksUrl,
        MARKOV_RELAY_ASSIGNMENT_SIGNING_KEY: readOrCreateSecret(join(options.dataDir, 'relay-assignment-key')),
        MARKOV_RELAY_DATA_DIR: join(options.dataDir, 'relay'),
        // Admin routes stay closed: only a token signed by the accounts key with this audience opens them.
        MARKOV_RELAY_ADMIN_AUDIENCE: `${relayUrl}/v1/admin/drain`,
        MARKOV_RELAY_ADMIN_JWKS_URL: jwksUrl,
        MARKOV_RELAY_DEPLOY_SERVICE_ACCOUNT: 'deploy@self-hosted.invalid',
        ...(options.relayDatabaseUrl ? { DATABASE_URL: options.relayDatabaseUrl } : {})
      })
    })
    )
  }
  const sharingUrl = options.sharingPort ? `http://${host}:${options.sharingPort}` : null
  if (sharingUrl) {
    services.push(
      startService({
        name: 'sharing',
        appDirectory: 'sharing',
        readyLine: '[markov-sharing] listening',
        log,
        env: childEnvironment(baseEnv, {
          PORT: String(options.sharingPort),
          MARKOV_SHARING_PUBLIC_URL: sharingUrl,
          MARKOV_SHARING_ACCOUNTS_URL: accountsUrl,
          MARKOV_SHARING_DATA_DIR: join(options.dataDir, 'sharing'),
          ...(options.sharingDatabaseUrl ? { MARKOV_SHARING_DATABASE_URL: options.sharingDatabaseUrl } : {})
        })
      })
    )
  }
  const connectorUrl = options.connectorPort ? `http://${host}:${options.connectorPort}` : null
  const connectorChat = options.connectorChat ?? { kind: 'fake' }
  if (connectorUrl) {
    services.push(
      startService({
        name: 'connector',
        appDirectory: 'connector',
        readyLine: '[markov-connector] listening',
        log,
        env: childEnvironment(baseEnv, {
          PORT: String(options.connectorPort),
          MARKOV_CONNECTOR_PUBLIC_URL: connectorUrl,
          MARKOV_CONNECTOR_AUTH_ISSUER: accountsUrl,
          MARKOV_CONNECTOR_JWKS_URL: jwksUrl,
          MARKOV_CONNECTOR_CHAT: connectorChat.kind,
          MARKOV_CONNECTOR_DATA_DIR: join(options.dataDir, 'connector'),
          ...(connectorChat.kind === 'slack'
            ? { SLACK_BOT_TOKEN: connectorChat.botToken, SLACK_APP_TOKEN: connectorChat.appToken }
            : {}),
          ...(options.connectorDatabaseUrl ? { MARKOV_CONNECTOR_DATABASE_URL: options.connectorDatabaseUrl } : {})
        })
      })
    )
  }
  const children = [accounts.child, ...services.map((service) => service.child)]
  const stop = async () => {
    await Promise.all(children.map(stopChild))
  }
  try {
    await Promise.all(services.map((service) => service.ready))
  } catch (error) {
    await stop()
    throw error
  }

  return {
    accountsUrl,
    relayUrl,
    sharingUrl,
    connectorUrl,
    desktopEnv: {
      MARKOV_CLOUD_API_URL: accountsUrl,
      MARKOV_CLOUD_CLIENT_ID: 'markov-desktop',
      ...(relayUrl ? { MARKOV_RELAY_URL: relayUrl } : {}),
      ...(sharingUrl ? { MARKOV_ARTIFACTS_API_URL: sharingUrl, MARKOV_SKILL_PACKAGE_DOWNLOAD_ORIGINS: sharingUrl } : {}),
      ...(connectorUrl ? { MARKOV_CONNECTOR_URL: connectorUrl } : {})
    },
    stop
  }
}

function loadLocalEnvFile() {
  const path = join(cloudDirectory, '.env.local')
  if (existsSync(path)) process.loadEnvFile(path)
}

async function main() {
  loadLocalEnvFile()
  const env = process.env
  const clerkReady = Boolean(env.CLERK_SECRET_KEY && env.CLERK_PUBLISHABLE_KEY)
  const identity = clerkReady
    ? { kind: 'clerk', secretKey: env.CLERK_SECRET_KEY, publishableKey: env.CLERK_PUBLISHABLE_KEY }
    : { kind: 'fake' }
  const slackReady = Boolean(env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN)
  const connectorChat = slackReady
    ? { kind: 'slack', botToken: env.SLACK_BOT_TOKEN, appToken: env.SLACK_APP_TOKEN }
    : { kind: 'fake' }
  const stack = await startSelfHostedStack({
    host: env.MARKOV_STACK_HOST ?? '127.0.0.1',
    accountsPort: Number(env.MARKOV_STACK_ACCOUNTS_PORT ?? 8790),
    relayPort: Number(env.MARKOV_STACK_RELAY_PORT ?? 8791),
    dataDir: join(cloudDirectory, '.local', 'self-hosted-stack'),
    identity,
    ...(env.MARKOV_STACK_ACCOUNTS_DATABASE_URL ? { accountsDatabaseUrl: env.MARKOV_STACK_ACCOUNTS_DATABASE_URL } : {}),
    ...(env.MARKOV_STACK_RELAY_DATABASE_URL ? { relayDatabaseUrl: env.MARKOV_STACK_RELAY_DATABASE_URL } : {}),
    sharingPort: Number(env.MARKOV_STACK_SHARING_PORT ?? 8792),
    ...(env.MARKOV_STACK_SHARING_DATABASE_URL ? { sharingDatabaseUrl: env.MARKOV_STACK_SHARING_DATABASE_URL } : {}),
    connectorPort: Number(env.MARKOV_STACK_CONNECTOR_PORT ?? 8793),
    ...(env.MARKOV_STACK_CONNECTOR_DATABASE_URL ? { connectorDatabaseUrl: env.MARKOV_STACK_CONNECTOR_DATABASE_URL } : {}),
    connectorChat,
    log: (line) => console.log(line)
  })
  const desktopEnv = Object.entries(stack.desktopEnv)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console.log(`
Self-hosted stack is running
  accounts  ${stack.accountsUrl}  (sign-in: ${identity.kind}${clerkReady ? '' : ' — add Clerk keys to cloud/.env.local for real sign-in'})
  relay     ${stack.relayUrl}
  sharing   ${stack.sharingUrl}
  connector ${stack.connectorUrl}  (chat: ${connectorChat.kind}${slackReady ? '' : ' — add Slack tokens to cloud/.env.local to drive agents from Slack'})

Start the desktop app against it from the repo root:
  ${desktopEnv} pnpm dev
`)
  const shutdown = () => {
    void stack.stop().then(() => process.exit(0))
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
