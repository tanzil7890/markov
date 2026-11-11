import { z } from 'zod'

// Mirrors the desktop client in src/main/markov-profiles/profile-cloud-client.ts,
// src/main/markov-profiles/profile-cloud-pkce.ts and
// src/main/runtime/mobile-cloud-relay/relay-http-client.ts; the self-hosted
// stack test runs that real client against this server to catch drift.

const Base64UrlSchema = z.string().regex(/^[A-Za-z0-9_-]+$/)
const OpaqueSchema = z.string().min(16).max(512)

export const AuthorizeQuerySchema = z.object({
  client_id: z.string().min(1).max(128),
  response_type: z.literal('code'),
  redirect_uri: z.string().min(1).max(2048),
  scope: z.string().max(512).optional(),
  nonce: OpaqueSchema,
  state: OpaqueSchema,
  code_challenge: Base64UrlSchema.length(43),
  code_challenge_method: z.literal('S256'),
  local_profile_id: z.string().min(1).max(256).optional()
})
export type AuthorizeQuery = z.infer<typeof AuthorizeQuerySchema>

export const SessionRequestSchema = z.object({
  code: z.string().min(1).max(512),
  codeVerifier: z.string().min(43).max(128),
  nonce: OpaqueSchema,
  redirectUri: z.string().min(1).max(2048),
  state: OpaqueSchema,
  localProfileId: z.string().min(1).max(256).optional()
})

export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(1).max(512) })

export const LogoutRequestSchema = z.object({ refreshToken: z.string().min(1).max(512).optional() })

export const ProfileRequestSchema = z.object({
  orgId: z.string().min(1).max(256).optional(),
  name: z.string().trim().min(1).max(200).optional()
})

export const OrgRequestSchema = z.object({ orgId: z.string().min(1).max(256) })

export const RelayTokenRequestSchema = z.object({
  relayHostId: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
  hostPublicKeyB64: z.string().min(1).max(128)
})

// machineId is the desktop's per-install random UUID.
export const ConnectorTokenRequestSchema = z.object({
  machineId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/)
})

export type OrganizationSummary = { orgId: string; name: string; role?: string }

export type CloudSummary = {
  cloudProfileId: string
  userId: string
  email: string
  displayName?: string
  activeOrgId?: string
  activeOrgName?: string
  linkedAt: number
}

export type Capabilities = { flags: Record<string, boolean>; refreshedAt: number }

export type AccountView = {
  cloud: CloudSummary
  organizations: OrganizationSummary[]
  capabilities: Capabilities
}

export type SessionResponse = AccountView & {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

// The desktop parses this strictly; extra fields make it reject the token.
export type RelayTokenResponse = { relayToken: string; expiresAt: number }

// expiresAt is epoch ms; the desktop reuses the token until a minute before it.
export type ConnectorTokenResponse = { connectorToken: string; expiresAt: number }

export const RELAY_USE_CAPABILITY = 'relay.use'

export function isLoopbackCallback(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]') &&
    url.port !== '' &&
    url.pathname === '/auth/callback' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password
  )
}
