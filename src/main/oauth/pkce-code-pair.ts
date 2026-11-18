import { createHash, randomBytes } from 'node:crypto'

export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** An unguessable value for a PKCE verifier, an OAuth `state` or a nonce. */
export function createOAuthRandomToken(): string {
  return base64UrlEncode(randomBytes(32))
}

export function createPkceCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest())
}
