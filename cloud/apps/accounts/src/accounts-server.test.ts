import { createHash, randomBytes } from 'node:crypto'
import nacl from 'tweetnacl'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { describe, expect, it } from 'vitest'
import { createAccountsApp } from './accounts-server.js'
import { openInMemoryAccountsDatabase } from './accounts-database.js'
import { loadAccountsConfig } from './config.js'
import { createFakeIdentityProvider } from './identity/fake-identity-provider.js'
import { createAccountsTokenSigner, relayHostIdForPublicKey } from './accounts-token-signer.js'

const PUBLIC_URL = 'http://127.0.0.1:8790'
const CALLBACK = 'http://127.0.0.1:53123/auth/callback'

async function createHarness() {
  const config = loadAccountsConfig({
    MARKOV_ACCOUNTS_PUBLIC_URL: PUBLIC_URL,
    MARKOV_ACCOUNTS_IDENTITY_PROVIDER: 'fake'
  })
  const signer = await createAccountsTokenSigner({
    issuer: config.issuer,
    relayTtlMs: 60_000,
    connectorTtlMs: 60_000,
    now: Date.now
  })
  const { app } = createAccountsApp({
    config,
    database: await openInMemoryAccountsDatabase(),
    identity: createFakeIdentityProvider({}),
    signer
  })
  return { app, signer }
}

type Harness = Awaited<ReturnType<typeof createHarness>>

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

async function postJson(harness: Harness, path: string, body: unknown, accessToken?: string) {
  return await harness.app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {})
    },
    body: JSON.stringify(body)
  })
}

async function signIn(harness: Harness) {
  const { verifier, challenge } = pkcePair()
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const query = new URLSearchParams({
    client_id: 'markov-desktop',
    response_type: 'code',
    redirect_uri: CALLBACK,
    nonce,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })
  const page = await harness.app.request(`/v1/desktop/auth/authorize?${query}`)
  const requestId = /name="markov-authorization-request" content="([^"]+)"/.exec(await page.text())?.[1]
  const completed = await postJson(harness, '/v1/desktop/auth/authorize/complete', {
    requestId,
    email: 'ada@example.com'
  })
  const redirectTo = new URL(((await completed.json()) as { redirectTo: string }).redirectTo)
  const exchange = {
    code: redirectTo.searchParams.get('code'),
    codeVerifier: verifier,
    nonce,
    redirectUri: CALLBACK,
    state: redirectTo.searchParams.get('state'),
    localProfileId: 'local-1'
  }
  return { exchange }
}

type SessionBody = {
  accessToken: string
  refreshToken: string
  cloud: { cloudProfileId: string; userId: string }
}

describe('accounts server', () => {
  it('accepts an authorization code once and rejects the replay', async () => {
    const harness = await createHarness()
    const { exchange } = await signIn(harness)
    const first = await postJson(harness, '/v1/desktop/auth/session', exchange)
    expect(first.status).toBe(200)
    const replay = await postJson(harness, '/v1/desktop/auth/session', exchange)
    expect(replay.status).toBe(400)
    expect(await replay.json()).toEqual({ error: 'invalid_grant' })
  })

  it('rejects a code exchanged with the wrong PKCE verifier', async () => {
    const harness = await createHarness()
    const { exchange } = await signIn(harness)
    const response = await postJson(harness, '/v1/desktop/auth/session', {
      ...exchange,
      codeVerifier: randomBytes(32).toString('base64url')
    })
    expect(response.status).toBe(400)
  })

  it('revokes the session family when a rotated refresh token is replayed', async () => {
    const harness = await createHarness()
    const { exchange } = await signIn(harness)
    const original = (await (await postJson(harness, '/v1/desktop/auth/session', exchange)).json()) as SessionBody
    const rotated = await postJson(harness, '/v1/desktop/auth/refresh', {
      refreshToken: original.refreshToken
    })
    expect(rotated.status).toBe(200)
    const successor = (await rotated.json()) as SessionBody
    const replay = await postJson(harness, '/v1/desktop/auth/refresh', {
      refreshToken: original.refreshToken
    })
    expect(replay.status).toBe(401)
    const afterReplay = await postJson(harness, '/v1/desktop/auth/capabilities', {}, successor.accessToken)
    expect(afterReplay.status).toBe(401)
  })

  it('mints relay tokens the relay can verify from the published keys', async () => {
    const harness = await createHarness()
    const { exchange } = await signIn(harness)
    const session = (await (await postJson(harness, '/v1/desktop/auth/session', exchange)).json()) as SessionBody
    const hostKeys = nacl.box.keyPair()
    const relayHostId = relayHostIdForPublicKey(hostKeys.publicKey)
    const hostPublicKeyB64 = Buffer.from(hostKeys.publicKey).toString('base64')

    const mismatch = await postJson(
      harness,
      '/v1/desktop/auth/relay-token',
      { relayHostId: 'AAAAAAAAAAAAAAAA', hostPublicKeyB64 },
      session.accessToken
    )
    expect(mismatch.status).toBe(400)

    const response = await postJson(
      harness,
      '/v1/desktop/auth/relay-token',
      { relayHostId, hostPublicKeyB64 },
      session.accessToken
    )
    const body = (await response.json()) as { relayToken: string; expiresAt: number }
    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'relayToken'])
    const jwks = (await (await harness.app.request('/.well-known/jwks.json')).json()) as Parameters<
      typeof createLocalJWKSet
    >[0]
    const { payload } = await jwtVerify(body.relayToken, createLocalJWKSet(jwks), {
      issuer: PUBLIC_URL,
      audience: 'markov-relay'
    })
    expect(payload).toMatchObject({
      sub: session.cloud.userId,
      prof: session.cloud.cloudProfileId,
      relayHostId,
      purpose: 'host-control'
    })
  })

  it('never redirects a sign-in to a callback off this machine', async () => {
    const harness = await createHarness()
    const { challenge } = pkcePair()
    const query = new URLSearchParams({
      client_id: 'markov-desktop',
      response_type: 'code',
      redirect_uri: 'https://attacker.example/auth/callback',
      nonce: randomBytes(32).toString('base64url'),
      state: randomBytes(32).toString('base64url'),
      code_challenge: challenge,
      code_challenge_method: 'S256'
    })
    const response = await harness.app.request(`/v1/desktop/auth/authorize?${query}`)
    expect(response.status).toBe(400)
    expect(response.headers.get('location')).toBeNull()
  })

  it('refuses to run the fake identity provider on a public address', () => {
    expect(() =>
      loadAccountsConfig({
        MARKOV_ACCOUNTS_PUBLIC_URL: 'https://login.example.com',
        MARKOV_ACCOUNTS_IDENTITY_PROVIDER: 'fake'
      })
    ).toThrow('loopback')
  })
})
