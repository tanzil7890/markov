import type { CloudDatabase } from '@markov-cloud/cloud-database'
import { createId, createOpaqueToken, hashToken } from './opaque-token.js'
import { rowNumber, rowOptionalNumber, rowString } from './sql-row.js'

export type IssuedSession = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
}

export type AuthenticatedSession = {
  sessionId: string
  familyId: string
  userId: string
  profileId: string
}

export type RotationResult =
  | { status: 'rotated'; session: AuthenticatedSession; tokens: IssuedSession }
  | { status: 'rejected' }

export class SessionStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly now: () => number,
    private readonly ttl: { accessMs: number; refreshMs: number }
  ) {}

  async issue(
    input: { userId: string; profileId: string; familyId?: string },
    database: CloudDatabase = this.database
  ): Promise<{ session: AuthenticatedSession; tokens: IssuedSession }> {
    const now = this.now()
    const session: AuthenticatedSession = {
      sessionId: createId('ses'),
      familyId: input.familyId ?? createId('sfm'),
      userId: input.userId,
      profileId: input.profileId
    }
    const tokens: IssuedSession = {
      accessToken: createOpaqueToken('oat'),
      refreshToken: createOpaqueToken('ort'),
      accessExpiresAt: now + this.ttl.accessMs
    }
    await database.query(
      `INSERT INTO accounts_sessions
         (session_id, family_id, user_id, profile_id, access_hash, access_expires_at,
          refresh_hash, refresh_expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.sessionId,
        session.familyId,
        session.userId,
        session.profileId,
        hashToken(tokens.accessToken),
        tokens.accessExpiresAt,
        hashToken(tokens.refreshToken),
        now + this.ttl.refreshMs,
        now
      ]
    )
    return { session, tokens }
  }

  async authenticate(accessToken: string): Promise<AuthenticatedSession | null> {
    const [row] = await this.database.query(
      `SELECT session_id, family_id, user_id, profile_id FROM accounts_sessions
       WHERE access_hash = ? AND access_expires_at > ? AND revoked_at IS NULL AND rotated_at IS NULL`,
      [hashToken(accessToken), this.now()]
    )
    return row
      ? {
          sessionId: rowString(row.session_id),
          familyId: rowString(row.family_id),
          userId: rowString(row.user_id),
          profileId: rowString(row.profile_id)
        }
      : null
  }

  // A spent refresh token showing up again means it leaked: the whole family is revoked.
  async rotate(refreshToken: string): Promise<RotationResult> {
    const now = this.now()
    const outcome = await this.database.transaction(async (tx): Promise<RotationResult | { status: 'reused'; familyId: string }> => {
      const [row] = await tx.query('SELECT * FROM accounts_sessions WHERE refresh_hash = ?', [
        hashToken(refreshToken)
      ])
      if (!row) return { status: 'rejected' }
      const familyId = rowString(row.family_id)
      if (rowOptionalNumber(row.revoked_at) !== null || rowNumber(row.refresh_expires_at) <= now) {
        return { status: 'rejected' }
      }
      if (rowOptionalNumber(row.rotated_at) !== null) {
        return { status: 'reused', familyId }
      }
      const [claimed] = await tx.query(
        `UPDATE accounts_sessions SET rotated_at = ?
         WHERE session_id = ? AND rotated_at IS NULL AND revoked_at IS NULL
         RETURNING session_id`,
        [now, rowString(row.session_id)]
      )
      if (!claimed) return { status: 'reused', familyId }
      const issued = await this.issue(
        { userId: rowString(row.user_id), profileId: rowString(row.profile_id), familyId },
        tx
      )
      return { status: 'rotated', ...issued }
    })
    if (outcome.status === 'reused') {
      await this.revokeFamily(outcome.familyId)
      return { status: 'rejected' }
    }
    return outcome
  }

  async familyForRefreshToken(refreshToken: string): Promise<string | null> {
    const [row] = await this.database.query('SELECT family_id FROM accounts_sessions WHERE refresh_hash = ?', [
      hashToken(refreshToken)
    ])
    return row ? rowString(row.family_id) : null
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.database.query(
      'UPDATE accounts_sessions SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL',
      [this.now(), familyId]
    )
  }

  async revokeUser(userId: string): Promise<void> {
    await this.database.query(
      'UPDATE accounts_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
      [this.now(), userId]
    )
  }

  async deleteExpired(): Promise<void> {
    await this.database.query('DELETE FROM accounts_sessions WHERE refresh_expires_at <= ?', [this.now()])
  }
}
