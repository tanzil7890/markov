import type { McpConnection } from '../../shared/mcp-connections'
import { createOAuthRandomToken, createPkceCodeChallenge } from '../oauth/pkce-code-pair'
import type { McpConnectionSecretVault } from './mcp-connection-secret-vault'
import { jsonRpcRequest } from './mcp-json-rpc'
import { discoverMcpOAuthTarget } from './mcp-oauth-discovery'
import { McpOAuthSignInError, openMcpOAuthLoopback } from './mcp-oauth-loopback'
import {
  exchangeMcpAuthorizationCode,
  mcpAuthorizationUrl,
  registerMcpOAuthClient
} from './mcp-oauth-token-client'
import { MCP_PREFERRED_PROTOCOL_VERSION } from './mcp-protocol-revisions'
import type { McpHttpFetch } from './mcp-streamable-http-transport'

export type McpOAuthSignInOptions = {
  vault: McpConnectionSecretVault
  fetch: McpHttpFetch
  /** Opens the sign-in page in the person's browser. */
  openExternal: (url: string) => Promise<void>
  now: () => number
  clientVersion: string
  signal?: AbortSignal
}

const PROBE_TIMEOUT_MS = 15_000

/** The server's sign-in challenge, or null when it accepts the request without one. */
async function readChallenge(
  url: string,
  options: McpOAuthSignInOptions
): Promise<{ required: boolean; challenge: string | null }> {
  const response = await options.fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify(
      jsonRpcRequest(0, 'initialize', {
        protocolVersion: MCP_PREFERRED_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'markov', title: 'Markov', version: options.clientVersion }
      })
    ),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
  })
  await response.body?.cancel().catch(() => undefined)
  return {
    required: response.status === 401,
    challenge: response.headers.get('www-authenticate')
  }
}

/** Runs the browser sign-in for an HTTP connection and stores the resulting grant. */
export async function signInToMcpConnection(
  connection: McpConnection,
  options: McpOAuthSignInOptions
): Promise<void> {
  if (connection.transport.kind !== 'http') {
    throw new McpOAuthSignInError('Only connections to a web address can use a browser sign-in.')
  }
  const serverUrl = connection.transport.url
  const probe = await readChallenge(serverUrl, options).catch(() => {
    throw new McpOAuthSignInError('Could not reach the server to start the sign-in.')
  })
  if (!probe.required) {
    throw new McpOAuthSignInError('This server did not ask for a sign-in.')
  }
  const target = await discoverMcpOAuthTarget({
    serverUrl,
    challenge: probe.challenge,
    fetch: options.fetch
  })
  const loopback = await openMcpOAuthLoopback()
  try {
    const client = await registerMcpOAuthClient({
      server: target.server,
      redirectUri: loopback.redirectUri,
      fetch: options.fetch
    })
    const state = createOAuthRandomToken()
    const codeVerifier = createOAuthRandomToken()
    const code = loopback.waitForCode(state, options.signal)
    // The wait is already armed, so a fast redirect cannot arrive before anyone listens.
    code.catch(() => undefined)
    await options.openExternal(
      mcpAuthorizationUrl({
        server: target.server,
        client,
        resource: target.resource,
        scopes: target.scopes,
        state,
        codeChallenge: createPkceCodeChallenge(codeVerifier)
      })
    )
    const tokens = await exchangeMcpAuthorizationCode({
      server: target.server,
      client,
      resource: target.resource,
      code: await code,
      codeVerifier,
      fetch: options.fetch,
      now: options.now()
    })
    const secrets = await options.vault.read(connection.id)
    await options.vault.write(connection.id, {
      ...secrets,
      oauth: { server: target.server, resource: target.resource, client, ...tokens }
    })
  } finally {
    loopback.close()
  }
}
