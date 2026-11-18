import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secret-store'
import { installMcpGateway } from './mcp-gateway-installation'
import { startMcpGateway } from './mcp-gateway-startup'

type FakeSignInServer = {
  origin: string
  /** Query of the authorization request the "browser" made. */
  authorization: URLSearchParams | null
  /** Bearer tokens the MCP endpoint was called with, in order. */
  bearers: string[]
  close(): Promise<void>
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

/** One server acting as the MCP server and its sign-in service; access tokens last 30 seconds. */
async function startFakeSignInServer(): Promise<FakeSignInServer> {
  const state: FakeSignInServer = {
    origin: '',
    authorization: null,
    bearers: [],
    close: async () => undefined
  }
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', state.origin)
      if (url.pathname === '/.well-known/oauth-protected-resource') {
        sendJson(response, 200, {
          resource: `${state.origin}/mcp`,
          authorization_servers: [state.origin]
        })
      } else if (url.pathname === '/.well-known/oauth-authorization-server') {
        sendJson(response, 200, {
          authorization_endpoint: `${state.origin}/authorize`,
          token_endpoint: `${state.origin}/token`,
          registration_endpoint: `${state.origin}/register`,
          code_challenge_methods_supported: ['S256']
        })
      } else if (url.pathname === '/register') {
        sendJson(response, 201, { client_id: 'client-1' })
      } else if (url.pathname === '/authorize') {
        state.authorization = url.searchParams
        const redirect = new URL(url.searchParams.get('redirect_uri') ?? state.origin)
        redirect.searchParams.set('code', 'code-1')
        redirect.searchParams.set('state', url.searchParams.get('state') ?? '')
        response.writeHead(302, { location: redirect.toString() }).end()
      } else if (url.pathname === '/token') {
        const grant = new URLSearchParams(await readBody(request))
        const challenge = createHash('sha256')
          .update(grant.get('code_verifier') ?? '')
          .digest('base64url')
        if (
          grant.get('grant_type') === 'refresh_token' &&
          grant.get('refresh_token') === 'refresh-1'
        ) {
          sendJson(response, 200, { access_token: 'access-2', expires_in: 3600 })
        } else if (
          grant.get('code') === 'code-1' &&
          challenge === state.authorization?.get('code_challenge')
        ) {
          sendJson(response, 200, {
            access_token: 'access-1',
            refresh_token: 'refresh-1',
            expires_in: 30
          })
        } else {
          sendJson(response, 400, { error: 'invalid_grant' })
        }
      } else if (url.pathname === '/mcp' && request.method === 'POST') {
        const bearer = request.headers.authorization?.replace(/^Bearer /, '') ?? ''
        const message: { id?: number; method?: string } = JSON.parse(await readBody(request))
        if (!bearer.startsWith('access-')) {
          response.writeHead(401, {
            'www-authenticate': `Bearer resource_metadata="${state.origin}/.well-known/oauth-protected-resource"`
          })
          response.end()
          return
        }
        state.bearers.push(bearer)
        if (message.id === undefined) {
          response.writeHead(202).end()
          return
        }
        sendJson(response, 200, {
          jsonrpc: '2.0',
          id: message.id,
          result:
            message.method === 'initialize'
              ? { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
              : { tools: [{ name: 'search', inputSchema: { type: 'object' } }] }
        })
      } else {
        response.writeHead(405).end()
      }
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  state.origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  state.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  return state
}

let directory = ''
const cleanups: (() => Promise<void>)[] = []

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'markov-mcp-sign-in-'))
  setSecretStore({
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(`sealed:${text}`),
    decryptString: (cipher) => cipher.toString().replace(/^sealed:/, ''),
    describeProtectionGap: () => null
  })
})

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
  installMcpGateway(null)
  _resetSecretStoreForTests()
  await rm(directory, { recursive: true, force: true })
})

describe('signing in to a connection', () => {
  it('signs in through the browser redirect, uses the token, and renews it when it is about to expire', async () => {
    const server = await startFakeSignInServer()
    const gateway = startMcpGateway({
      userDataPath: directory,
      appVersion: '1.0.0',
      // The person's browser: it follows the sign-in page's redirect back to this machine.
      openExternal: async (url) => {
        await (await fetch(url)).text()
      }
    })
    cleanups.push(() => gateway.dispose(), server.close)
    const added = await gateway.add({
      name: 'docs',
      title: 'Docs',
      transport: { kind: 'http', url: `${server.origin}/mcp` },
      secrets: {}
    })

    expect((await gateway.check(added.id)).status.state).toBe('needs-sign-in')

    const signedIn = await gateway.signIn(added.id)

    expect(signedIn).toMatchObject({
      signedIn: true,
      status: { state: 'connected', toolCount: 1, message: null }
    })
    expect(server.authorization?.get('client_id')).toBe('client-1')
    expect(server.authorization?.get('code_challenge_method')).toBe('S256')
    expect(server.authorization?.get('resource')).toBe(`${server.origin}/mcp`)
    // The 30-second token is inside the renewal margin, so the first use already renews it.
    expect(new Set(server.bearers)).toEqual(new Set(['access-2']))

    const signedOut = await gateway.signOut(added.id)

    expect(signedOut).toMatchObject({ signedIn: false, status: { state: 'needs-sign-in' } })
  })
})
