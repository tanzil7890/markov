import { z } from 'zod'

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]'])

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65_535).default(8792),
  NODE_ENV: z.string().optional(),
  MARKOV_SHARING_PUBLIC_URL: z.string().url(),
  MARKOV_SHARING_ACCOUNTS_URL: z.string().url(),
  MARKOV_SHARING_DATABASE_URL: z.string().optional(),
  MARKOV_SHARING_DATABASE_POOL_MAX: z.coerce.number().int().positive().max(50).default(5),
  MARKOV_SHARING_DATA_DIR: z.string().default('./data/sharing')
})

export type SharingConfig = {
  port: number
  publicUrl: string
  accountsUrl: string
  databaseUrl?: string
  databasePoolMax: number
  dataDir: string
  artifactTtlMs: number
  artifactRetentionMs: number
  uploadPolicyTtlMs: number
  downloadGrantTtlMs: number
  callerCacheMs: number
}

export function isLoopbackUrl(value: string): boolean {
  return LOOPBACK_HOSTNAMES.has(new URL(value).hostname)
}

function originOf(value: string, name: string): string {
  const url = new URL(value)
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name} must be a bare origin such as https://share.example.com`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackUrl(value))) {
    throw new Error(`${name} must use https unless it is a loopback address`)
  }
  return url.origin
}

export function loadSharingConfig(source: NodeJS.ProcessEnv = process.env): SharingConfig {
  const env = EnvSchema.parse(source)
  return {
    port: env.PORT,
    publicUrl: originOf(env.MARKOV_SHARING_PUBLIC_URL, 'MARKOV_SHARING_PUBLIC_URL'),
    accountsUrl: originOf(env.MARKOV_SHARING_ACCOUNTS_URL, 'MARKOV_SHARING_ACCOUNTS_URL'),
    ...(env.MARKOV_SHARING_DATABASE_URL ? { databaseUrl: env.MARKOV_SHARING_DATABASE_URL } : {}),
    databasePoolMax: env.MARKOV_SHARING_DATABASE_POOL_MAX,
    dataDir: env.MARKOV_SHARING_DATA_DIR,
    artifactTtlMs: 30 * 24 * 60 * 60_000,
    artifactRetentionMs: 7 * 24 * 60 * 60_000,
    uploadPolicyTtlMs: 30 * 60_000,
    downloadGrantTtlMs: 15 * 60_000,
    callerCacheMs: 30_000
  }
}
