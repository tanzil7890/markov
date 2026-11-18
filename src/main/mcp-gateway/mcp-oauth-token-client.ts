import { z } from 'zod'
import type { McpAuthorizationServer } from './mcp-oauth-discovery'
import type { McpHttpFetch } from './mcp-streamable-http-transport'

const TOKEN_TIMEOUT_MS = 30_000
const ERROR_PREVIEW_CHARS = 200

const registrationSchema = z.looseObject({
  client_id: z.string().min(1),
  client_secret: z.string().optional()
})

const tokenSchema = z.looseObject({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.coerce.number().positive().optional()
})

export const mcpOAuthClientSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().nullable(),
  redirectUri: z.string()
})

export type McpOAuthClient = z.infer<typeof mcpOAuthClientSchema>

export type McpOAuthTokens = {
  accessToken: string
  refreshToken: string | null
  /** Epoch milliseconds, or null when the server did not say. */
  expiresAt: number | null
}

export class McpOAuthRequestError extends Error {
  /** The authorization server rejected the grant itself, so retrying it cannot help. */
  readonly grantRejected: boolean

  constructor(message: string, grantRejected = false) {
    super(message)
    this.name = 'McpOAuthRequestError'
    this.grantRejected = grantRejected
  }
}

async function postForJson(
  fetch: McpHttpFetch,
  url: string,
  init: Pick<RequestInit, 'headers' | 'body'>,
  action: string
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      ...init,
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS)
    })
  } catch (error) {
    throw new McpOAuthRequestError(
      `Could not ${action}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new McpOAuthRequestError(
      `Could not ${action} (HTTP ${response.status})${
        text ? `: ${text.trim().slice(0, ERROR_PREVIEW_CHARS)}` : ''
      }`,
      response.status === 400 || response.status === 401
    )
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new McpOAuthRequestError(`Could not ${action}: the reply was not JSON`)
  }
}

export async function registerMcpOAuthClient(input: {
  server: McpAuthorizationServer
  redirectUri: string
  fetch: McpHttpFetch
}): Promise<McpOAuthClient> {
  if (!input.server.registrationEndpoint) {
    throw new McpOAuthRequestError(
      'This server does not let apps register for sign-in. Add its API key as a header instead.'
    )
  }
  const registration = registrationSchema.safeParse(
    await postForJson(
      input.fetch,
      input.server.registrationEndpoint,
      {
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          client_name: 'Markov',
          redirect_uris: [input.redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          application_type: 'native'
        })
      },
      'register Markov with the sign-in service'
    )
  )
  if (!registration.success) {
    throw new McpOAuthRequestError('The sign-in service did not return a client registration')
  }
  return {
    clientId: registration.data.client_id,
    clientSecret: registration.data.client_secret ?? null,
    redirectUri: input.redirectUri
  }
}

export function mcpAuthorizationUrl(input: {
  server: McpAuthorizationServer
  client: McpOAuthClient
  resource: string
  scopes: string[]
  state: string
  codeChallenge: string
}): string {
  const url = new URL(input.server.authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', input.client.clientId)
  url.searchParams.set('redirect_uri', input.client.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', input.resource)
  if (input.scopes.length > 0) {
    url.searchParams.set('scope', input.scopes.join(' '))
  }
  return url.toString()
}

async function requestTokens(
  input: {
    server: McpAuthorizationServer
    client: McpOAuthClient
    resource: string
    fetch: McpHttpFetch
    now: number
  },
  grant: Record<string, string>,
  action: string
): Promise<McpOAuthTokens> {
  const body = new URLSearchParams({
    ...grant,
    client_id: input.client.clientId,
    resource: input.resource,
    ...(input.client.clientSecret ? { client_secret: input.client.clientSecret } : {})
  })
  const tokens = tokenSchema.safeParse(
    await postForJson(
      input.fetch,
      input.server.tokenEndpoint,
      {
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json'
        },
        body: body.toString()
      },
      action
    )
  )
  if (!tokens.success) {
    throw new McpOAuthRequestError(`Could not ${action}: the reply held no access token`)
  }
  return {
    accessToken: tokens.data.access_token,
    refreshToken: tokens.data.refresh_token ?? null,
    expiresAt: tokens.data.expires_in ? input.now + tokens.data.expires_in * 1000 : null
  }
}

export function exchangeMcpAuthorizationCode(input: {
  server: McpAuthorizationServer
  client: McpOAuthClient
  resource: string
  code: string
  codeVerifier: string
  fetch: McpHttpFetch
  now: number
}): Promise<McpOAuthTokens> {
  return requestTokens(
    input,
    {
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.client.redirectUri
    },
    'finish the sign-in'
  )
}

/** Servers that rotate refresh tokens return a new one; otherwise the old one stays valid. */
export async function refreshMcpAccessToken(input: {
  server: McpAuthorizationServer
  client: McpOAuthClient
  resource: string
  refreshToken: string
  fetch: McpHttpFetch
  now: number
}): Promise<McpOAuthTokens> {
  const tokens = await requestTokens(
    input,
    { grant_type: 'refresh_token', refresh_token: input.refreshToken },
    'renew the sign-in'
  )
  return { ...tokens, refreshToken: tokens.refreshToken ?? input.refreshToken }
}
