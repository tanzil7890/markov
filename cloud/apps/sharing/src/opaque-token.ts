import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// The desktop rejects any id outside this pattern, including server-issued ones.
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export function createId(): string {
  return randomBytes(24).toString('base64url')
}

export function createOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`
}

export function createSalt(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

export function tokenMatchesHash(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token))
  const expected = Buffer.from(expectedHash)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Replays must return the same token unstored: derive it from the caller's key plus a stored salt.
export function deriveReplayToken(prefix: string, salt: string, idempotencyKey: string): string {
  const mac = createHmac('sha256', Buffer.from(salt, 'base64url')).update(idempotencyKey)
  return `${prefix}_${mac.digest('base64url')}`
}
