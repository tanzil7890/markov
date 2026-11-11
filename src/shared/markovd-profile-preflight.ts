import { z } from 'zod'

export const MARKOVD_PROFILE_PREFLIGHT_FLAG = '--markovd-profile-state-preflight'
export const MARKOVD_STARTUP_PREFLIGHT_FLAG = '--markovd-startup-preflight'
export const MARKOVD_PROFILE_PREFLIGHT_TIMEOUT_MS = 90_000
// Server startup follows the disposable native/SQLite probe on every bundled launch.
export const MARKOVD_STARTUP_READINESS_TIMEOUT_MS = MARKOVD_PROFILE_PREFLIGHT_TIMEOUT_MS + 90_000

export const MARKOVD_PREFLIGHT_RUNTIMES = ['node', 'bun'] as const

/** The runtime the caller launched; the candidate must prove it ran under exactly this one. */
export type MarkovdPreflightRuntimeIdentity = {
  runtime: (typeof MARKOVD_PREFLIGHT_RUNTIMES)[number]
  runtimeVersion: string
}

export const markovdProfilePreflightResponseSchema = z.object({
  type: z.literal('markov_profile_state_ready'),
  nonce: z.string().uuid(),
  runtime: z.enum(MARKOVD_PREFLIGHT_RUNTIMES),
  runtimeVersion: z.string().min(1),
  artifactVersion: z.string().regex(/^\d+\.\d+\.\d+\+[a-f0-9]{12}$/),
  sqliteVersion: z.string().min(1),
  revision: z.number().int().positive(),
  /** Daemon generations alive under the served data root, when asked; null when unverifiable. */
  liveDaemonProtocols: z.array(z.number().int().positive()).nullable().optional()
})

export type MarkovdProfilePreflightResponse = z.infer<typeof markovdProfilePreflightResponseSchema>

/** A fresh challenge prevents stale or unrelated output from admitting a candidate. */
export function parseMarkovdProfilePreflight(
  output: string,
  nonce: string,
  expected: MarkovdPreflightRuntimeIdentity,
  artifactVersion?: string
): MarkovdProfilePreflightResponse {
  const response = markovdProfilePreflightResponseSchema.parse(JSON.parse(output.trim()))
  if (
    response.nonce !== nonce ||
    response.runtime !== expected.runtime ||
    response.runtimeVersion !== expected.runtimeVersion ||
    (artifactVersion !== undefined && response.artifactVersion !== artifactVersion)
  ) {
    throw new Error('Profile preflight did not run under the expected candidate runtime')
  }
  return response
}
