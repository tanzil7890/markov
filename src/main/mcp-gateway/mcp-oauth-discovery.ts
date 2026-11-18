import { z } from 'zod'
import type { McpHttpFetch } from './mcp-streamable-http-transport'

const DISCOVERY_TIMEOUT_MS = 15_000

const protectedResourceSchema = z.looseObject({
  resource: z.string().optional(),
  authorization_servers: z.array(z.string()).optional(),
  scopes_supported: z.array(z.string()).optional()
})

const authorizationServerSchema = z.looseObject({
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string().optional(),
  code_challenge_methods_supported: z.array(z.string()).optional()
})

export const mcpAuthorizationServerSchema = z.object({
  authorizationEndpoint: z.string(),
  tokenEndpoint: z.string(),
  registrationEndpoint: z.string().nullable()
})

export type McpAuthorizationServer = z.infer<typeof mcpAuthorizationServerSchema>

export type McpOAuthTarget = {
  /** Sent as `resource` so the token is only good for this MCP server. */
  resource: string
  scopes: string[]
  server: McpAuthorizationServer
}

export class McpOAuthDiscoveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpOAuthDiscoveryError'
  }
}

function challengeParameter(challenge: string | null, name: string): string | null {
  return challenge?.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1] ?? null
}

function isLoopback(url: URL): boolean {
  return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
}

/** Sign-in endpoints carry credentials, so they must be HTTPS unless they are on this machine. */
function secureEndpoint(value: string, label: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new McpOAuthDiscoveryError(`The server's ${label} is not a valid URL`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url))) {
    throw new McpOAuthDiscoveryError(`The server's ${label} does not use HTTPS`)
  }
  return url.toString()
}

async function fetchJson(fetch: McpHttpFetch, url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }
    return await response.json()
  } catch {
    return null
  }
}

async function firstMatch<T>(
  fetch: McpHttpFetch,
  urls: string[],
  schema: z.ZodType<T>
): Promise<T | null> {
  for (const url of urls) {
    const parsed = schema.safeParse(await fetchJson(fetch, url))
    if (parsed.success) {
      return parsed.data
    }
  }
  return null
}

function wellKnownUrls(base: URL, suffixes: string[]): string[] {
  const path = base.pathname === '/' ? '' : base.pathname.replace(/\/$/, '')
  const urls = suffixes.flatMap((suffix) => [
    `${base.origin}/.well-known/${suffix}${path}`,
    ...(path ? [`${base.origin}${path}/.well-known/${suffix}`] : [])
  ])
  return [...new Set(urls)]
}

/** Finds where to sign in for an MCP server that answered 401. */
export async function discoverMcpOAuthTarget(input: {
  serverUrl: string
  challenge: string | null
  fetch: McpHttpFetch
}): Promise<McpOAuthTarget> {
  const server = new URL(input.serverUrl)
  const advertised = challengeParameter(input.challenge, 'resource_metadata')
  const resource = await firstMatch(
    input.fetch,
    advertised
      ? [secureEndpoint(advertised, 'resource metadata address')]
      : [
          ...wellKnownUrls(server, ['oauth-protected-resource']),
          `${server.origin}/.well-known/oauth-protected-resource`
        ],
    protectedResourceSchema
  )
  if (resource?.resource && new URL(resource.resource).origin !== server.origin) {
    throw new McpOAuthDiscoveryError('The sign-in details describe a different server')
  }
  // Servers that predate resource metadata act as their own authorization server.
  const issuer = new URL(resource?.authorization_servers?.[0] ?? server.origin)
  const metadata = await firstMatch(
    input.fetch,
    wellKnownUrls(issuer, ['oauth-authorization-server', 'openid-configuration']),
    authorizationServerSchema
  )
  if (!metadata && resource?.authorization_servers?.length) {
    throw new McpOAuthDiscoveryError('Could not read the sign-in service this server points to')
  }
  if (
    metadata?.code_challenge_methods_supported &&
    !metadata.code_challenge_methods_supported.includes('S256')
  ) {
    throw new McpOAuthDiscoveryError('The sign-in service does not support PKCE')
  }
  const scope = challengeParameter(input.challenge, 'scope')
  return {
    resource: resource?.resource ?? `${server.origin}${server.pathname}`,
    scopes: scope ? scope.split(/\s+/).filter(Boolean) : (resource?.scopes_supported ?? []),
    server: {
      authorizationEndpoint: secureEndpoint(
        metadata?.authorization_endpoint ?? `${issuer.origin}/authorize`,
        'sign-in address'
      ),
      tokenEndpoint: secureEndpoint(
        metadata?.token_endpoint ?? `${issuer.origin}/token`,
        'token address'
      ),
      registrationEndpoint: metadata
        ? metadata.registration_endpoint
          ? secureEndpoint(metadata.registration_endpoint, 'registration address')
          : null
        : `${issuer.origin}/register`
    }
  }
}
