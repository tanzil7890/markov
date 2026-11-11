import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function createOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function pkceChallengeMatches(verifier: string, challenge: string): boolean {
  const expected = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const actual = Buffer.from(challenge)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
