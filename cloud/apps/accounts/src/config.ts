import { z } from 'zod'

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65_535).default(8790),
  NODE_ENV: z.string().optional(),
  MARKOV_ACCOUNTS_PUBLIC_URL: z.string().url(),
  MARKOV_ACCOUNTS_ISSUER: z.string().url().optional(),
  MARKOV_ACCOUNTS_CLIENT_IDS: z.string().default('markov-desktop'),
  MARKOV_ACCOUNTS_IDENTITY_PROVIDER: z.enum(['clerk', 'fake']).default('clerk'),
  MARKOV_ACCOUNTS_FAKE_AUTO_APPROVE_EMAIL: z.string().email().optional(),
  MARKOV_ACCOUNTS_SIGNING_KEY_PEM: z.string().optional(),
  MARKOV_ACCOUNTS_DATABASE_URL: z.string().optional(),
  MARKOV_ACCOUNTS_DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(5),
  MARKOV_ACCOUNTS_DATA_DIR: z.string().default('./data/accounts'),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional()
})

export type IdentityProviderConfig =
  | { kind: 'clerk'; secretKey: string; publishableKey: string }
  | { kind: 'fake'; autoApproveEmail?: string }

export type AccountsConfig = {
  port: number
  publicUrl: string
  issuer: string
  clientIds: ReadonlySet<string>
  identity: IdentityProviderConfig
  signingKeyPem?: string
  persistGeneratedSigningKey: boolean
  databaseUrl?: string
  databasePoolMax: number
  dataDir: string
  accessTokenTtlMs: number
  refreshTokenTtlMs: number
  relayTokenTtlMs: number
  connectorTokenTtlMs: number
  authorizationRequestTtlMs: number
  authorizationCodeTtlMs: number
  identityResyncMs: number
}

export function isLoopbackUrl(value: string): boolean {
  return LOOPBACK_HOSTNAMES.has(new URL(value).hostname)
}

function originOf(value: string, name: string): string {
  const url = new URL(value)
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be a bare origin such as https://login.example.com`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackUrl(value))) {
    throw new Error(`${name} must use https unless it is a loopback address`)
  }
  return url.origin
}

function identityConfig(env: z.infer<typeof EnvSchema>, publicUrl: string): IdentityProviderConfig {
  if (env.MARKOV_ACCOUNTS_IDENTITY_PROVIDER === 'fake') {
    // The fake provider signs anyone in; it must never be reachable off this machine.
    if (!isLoopbackUrl(publicUrl) || env.NODE_ENV === 'production') {
      throw new Error('The fake identity provider only runs on a loopback MARKOV_ACCOUNTS_PUBLIC_URL')
    }
    return env.MARKOV_ACCOUNTS_FAKE_AUTO_APPROVE_EMAIL
      ? { kind: 'fake', autoApproveEmail: env.MARKOV_ACCOUNTS_FAKE_AUTO_APPROVE_EMAIL }
      : { kind: 'fake' }
  }
  if (!env.CLERK_SECRET_KEY || !env.CLERK_PUBLISHABLE_KEY) {
    throw new Error('CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY are required for Clerk sign-in')
  }
  return {
    kind: 'clerk',
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY
  }
}

export function loadAccountsConfig(source: NodeJS.ProcessEnv = process.env): AccountsConfig {
  const env = EnvSchema.parse(source)
  const publicUrl = originOf(env.MARKOV_ACCOUNTS_PUBLIC_URL, 'MARKOV_ACCOUNTS_PUBLIC_URL')
  const production = env.NODE_ENV === 'production'
  if (production && !env.MARKOV_ACCOUNTS_SIGNING_KEY_PEM) {
    throw new Error('MARKOV_ACCOUNTS_SIGNING_KEY_PEM is required in production')
  }
  const clientIds = new Set(
    env.MARKOV_ACCOUNTS_CLIENT_IDS.split(',')
      .map((clientId) => clientId.trim())
      .filter(Boolean)
  )
  if (clientIds.size === 0) {
    throw new Error('MARKOV_ACCOUNTS_CLIENT_IDS must name at least one client')
  }
  return {
    port: env.PORT,
    publicUrl,
    issuer: env.MARKOV_ACCOUNTS_ISSUER ? new URL(env.MARKOV_ACCOUNTS_ISSUER).toString().replace(/\/$/, '') : publicUrl,
    clientIds,
    identity: identityConfig(env, publicUrl),
    ...(env.MARKOV_ACCOUNTS_SIGNING_KEY_PEM ? { signingKeyPem: env.MARKOV_ACCOUNTS_SIGNING_KEY_PEM } : {}),
    persistGeneratedSigningKey: !production,
    ...(env.MARKOV_ACCOUNTS_DATABASE_URL ? { databaseUrl: env.MARKOV_ACCOUNTS_DATABASE_URL } : {}),
    databasePoolMax: env.MARKOV_ACCOUNTS_DATABASE_POOL_MAX,
    dataDir: env.MARKOV_ACCOUNTS_DATA_DIR,
    accessTokenTtlMs: 60 * 60_000,
    refreshTokenTtlMs: 30 * 24 * 60 * 60_000,
    relayTokenTtlMs: 15 * 60_000,
    connectorTokenTtlMs: 5 * 60_000,
    authorizationRequestTtlMs: 10 * 60_000,
    authorizationCodeTtlMs: 2 * 60_000,
    identityResyncMs: 5 * 60_000
  }
}
