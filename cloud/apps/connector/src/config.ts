import { z } from 'zod'

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65_535).default(8793),
  NODE_ENV: z.string().optional(),
  MARKOV_CONNECTOR_PUBLIC_URL: z.string().url(),
  MARKOV_CONNECTOR_AUTH_ISSUER: z.string().url(),
  MARKOV_CONNECTOR_JWKS_URL: z.string().url(),
  MARKOV_CONNECTOR_CHAT: z.enum(['slack', 'fake', 'none']).default('none'),
  MARKOV_CONNECTOR_DATABASE_URL: z.string().optional(),
  MARKOV_CONNECTOR_DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(5),
  MARKOV_CONNECTOR_DATA_DIR: z.string().default('./data/connector'),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional()
})

export type ChatConfig =
  | { kind: 'slack'; botToken: string; appToken: string }
  | { kind: 'fake' }
  | { kind: 'none' }

export type ConnectorConfig = {
  port: number
  publicUrl: string
  authIssuer: string
  jwksUrl: string
  chat: ChatConfig
  databaseUrl?: string
  databasePoolMax: number
  dataDir: string
  // A machine counts as reachable while it polled this recently.
  machineOnlineMs: number
  pollHoldMs: number
}

export function isLoopbackUrl(value: string): boolean {
  return LOOPBACK_HOSTNAMES.has(new URL(value).hostname)
}

function originOf(value: string, name: string): string {
  const url = new URL(value)
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be a bare origin such as https://connector.example.com`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackUrl(value))) {
    throw new Error(`${name} must use https unless it is a loopback address`)
  }
  return url.origin
}

function chatConfig(env: z.infer<typeof EnvSchema>, publicUrl: string): ChatConfig {
  if (env.MARKOV_CONNECTOR_CHAT === 'slack') {
    if (!env.SLACK_BOT_TOKEN?.startsWith('xoxb-') || !env.SLACK_APP_TOKEN?.startsWith('xapp-')) {
      throw new Error('Slack needs SLACK_BOT_TOKEN (xoxb-…) and SLACK_APP_TOKEN (xapp-…)')
    }
    return { kind: 'slack', botToken: env.SLACK_BOT_TOKEN, appToken: env.SLACK_APP_TOKEN }
  }
  if (env.MARKOV_CONNECTOR_CHAT === 'fake') {
    // The fake chat lets any local caller act as any chat user; it must stay on this machine.
    if (!isLoopbackUrl(publicUrl) || env.NODE_ENV === 'production') {
      throw new Error('The fake chat platform only runs on a loopback MARKOV_CONNECTOR_PUBLIC_URL')
    }
    return { kind: 'fake' }
  }
  return { kind: 'none' }
}

export function loadConnectorConfig(source: NodeJS.ProcessEnv = process.env): ConnectorConfig {
  const env = EnvSchema.parse(source)
  const publicUrl = originOf(env.MARKOV_CONNECTOR_PUBLIC_URL, 'MARKOV_CONNECTOR_PUBLIC_URL')
  return {
    port: env.PORT,
    publicUrl,
    authIssuer: new URL(env.MARKOV_CONNECTOR_AUTH_ISSUER).toString().replace(/\/$/, ''),
    jwksUrl: env.MARKOV_CONNECTOR_JWKS_URL,
    chat: chatConfig(env, publicUrl),
    ...(env.MARKOV_CONNECTOR_DATABASE_URL ? { databaseUrl: env.MARKOV_CONNECTOR_DATABASE_URL } : {}),
    databasePoolMax: env.MARKOV_CONNECTOR_DATABASE_POOL_MAX,
    dataDir: env.MARKOV_CONNECTOR_DATA_DIR,
    machineOnlineMs: 2 * 60_000,
    pollHoldMs: 50_000
  }
}
