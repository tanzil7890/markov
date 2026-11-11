import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { calculateJwkThumbprint, exportJWK, SignJWT, type JWK } from 'jose'
import type { ConnectorTokenResponse, RelayTokenResponse } from './desktop-auth-contract.js'

// Must match the relay: MARKOV_RELAY_AUTH_AUDIENCE is pinned to this literal.
export const RELAY_AUDIENCE = 'markov-relay'
// Must match the connector server's token verifier.
export const CONNECTOR_AUDIENCE = 'markov-connector'
const SIGNING_KEY_FILE = 'accounts-signing-key.pem'

export type RelayTokenClaims = {
  userId: string
  profileId: string
  orgId: string | null
  relayHostId: string
}

export type ConnectorTokenClaims = {
  userId: string
  machineId: string
  email: string
}

export type AccountsTokenSigner = {
  jwks(): { keys: JWK[] }
  mint(claims: RelayTokenClaims): Promise<RelayTokenResponse>
  mintConnector(claims: ConnectorTokenClaims): Promise<ConnectorTokenResponse>
}

export function relayHostIdForPublicKey(publicKey: Uint8Array): string {
  return createHash('sha256').update(publicKey).digest('base64url').slice(0, 16)
}

export function generateSigningKeyPem(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
}

// Development keeps one generated key on disk so restarts do not invalidate relay sessions.
function readOrCreateDevelopmentKey(dataDir: string): string {
  const path = join(dataDir, SIGNING_KEY_FILE)
  if (existsSync(path)) {
    return readFileSync(path, 'utf8')
  }
  mkdirSync(dataDir, { recursive: true })
  const pem = generateSigningKeyPem()
  writeFileSync(path, pem, { mode: 0o600 })
  return pem
}

export async function createAccountsTokenSigner(input: {
  issuer: string
  relayTtlMs: number
  connectorTtlMs: number
  now: () => number
  signingKeyPem?: string
  dataDir?: string
}): Promise<AccountsTokenSigner> {
  const pem =
    input.signingKeyPem ??
    (input.dataDir ? readOrCreateDevelopmentKey(input.dataDir) : generateSigningKeyPem())
  const privateKey: KeyObject = createPrivateKey(pem)
  if (privateKey.asymmetricKeyType !== 'ec' || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('The accounts signing key must be an EC P-256 private key')
  }
  const publicJwk = await exportJWK(createPublicKey(privateKey))
  const kid = await calculateJwkThumbprint(publicJwk)
  const published: JWK = { ...publicJwk, kid, alg: 'ES256', use: 'sig' }

  async function sign(claims: Record<string, string>, audience: string, subject: string, ttlMs: number) {
    const issuedAt = input.now()
    const expiresAt = issuedAt + ttlMs
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer(input.issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(privateKey)
    return { token, expiresAt: Math.floor(expiresAt / 1000) * 1000 }
  }

  return {
    jwks: () => ({ keys: [published] }),
    async mint(claims) {
      const { token, expiresAt } = await sign(
        {
          prof: claims.profileId,
          ...(claims.orgId ? { org: claims.orgId } : {}),
          relayHostId: claims.relayHostId,
          purpose: 'host-control'
        },
        RELAY_AUDIENCE,
        claims.userId,
        input.relayTtlMs
      )
      return { relayToken: token, expiresAt }
    },
    async mintConnector(claims) {
      const { token, expiresAt } = await sign(
        { mid: claims.machineId, email: claims.email, purpose: 'connector' },
        CONNECTOR_AUDIENCE,
        claims.userId,
        input.connectorTtlMs
      )
      return { connectorToken: token, expiresAt }
    }
  }
}
