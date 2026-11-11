import { createRemoteJWKSet, jwtVerify } from 'jose'

// Must match the accounts server's CONNECTOR_AUDIENCE.
export const CONNECTOR_AUDIENCE = 'markov-connector'

export type ConnectorIdentity = { userId: string; machineId: string; email: string; expiresAt: number }

export type ConnectorTokenVerifier = (token: string) => Promise<ConnectorIdentity | null>

export function createConnectorTokenVerifier(input: { issuer: string; jwksUrl: string }): ConnectorTokenVerifier {
  const keys = createRemoteJWKSet(new URL(input.jwksUrl))
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: input.issuer,
        audience: CONNECTOR_AUDIENCE,
        algorithms: ['ES256']
      })
      const { sub, mid, email, exp, purpose } = payload
      if (purpose !== 'connector' || typeof sub !== 'string' || typeof mid !== 'string') return null
      if (typeof email !== 'string' || typeof exp !== 'number') return null
      return { userId: sub, machineId: mid, email, expiresAt: exp * 1000 }
    } catch {
      return null
    }
  }
}
