import type { CloudDatabase } from '@markov-cloud/cloud-database'
import { createId, createOpaqueToken, hashToken } from './opaque-token.js'
import { rowNumber, rowOptionalNumber, rowOptionalString, rowString } from './sql-row.js'

export type AuthorizationRequest = {
  requestId: string
  clientId: string
  redirectUri: string
  state: string
  nonce: string
  codeChallenge: string
  localProfileId: string | null
  expiresAt: number
  completedAt: number | null
}

export type RedeemedCode = { request: AuthorizationRequest; userId: string }

function toRequest(row: Record<string, unknown>): AuthorizationRequest {
  return {
    requestId: rowString(row.request_id),
    clientId: rowString(row.client_id),
    redirectUri: rowString(row.redirect_uri),
    state: rowString(row.state),
    nonce: rowString(row.nonce),
    codeChallenge: rowString(row.code_challenge),
    localProfileId: rowOptionalString(row.local_profile_id),
    expiresAt: rowNumber(row.expires_at),
    completedAt: rowOptionalNumber(row.completed_at)
  }
}

export class AuthorizationStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly now: () => number,
    private readonly ttl: { requestMs: number; codeMs: number }
  ) {}

  async createRequest(
    input: Omit<AuthorizationRequest, 'requestId' | 'expiresAt' | 'completedAt'>
  ): Promise<AuthorizationRequest> {
    const requestId = createId('azr')
    await this.database.query(
      `INSERT INTO accounts_authorization_requests
         (request_id, client_id, redirect_uri, state, nonce, code_challenge, local_profile_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        input.clientId,
        input.redirectUri,
        input.state,
        input.nonce,
        input.codeChallenge,
        input.localProfileId,
        this.now() + this.ttl.requestMs
      ]
    )
    return (await this.getRequest(requestId))!
  }

  async getRequest(requestId: string): Promise<AuthorizationRequest | null> {
    const [row] = await this.database.query(
      'SELECT * FROM accounts_authorization_requests WHERE request_id = ?',
      [requestId]
    )
    return row ? toRequest(row) : null
  }

  // One sign-in completes a request once; a second completion gets null.
  async completeRequest(requestId: string, userId: string): Promise<{ code: string; request: AuthorizationRequest } | null> {
    const now = this.now()
    return await this.database.transaction(async (tx) => {
      const [row] = await tx.query(
        `UPDATE accounts_authorization_requests SET completed_at = ?
         WHERE request_id = ? AND completed_at IS NULL AND expires_at > ?
         RETURNING *`,
        [now, requestId, now]
      )
      if (!row) return null
      const code = createOpaqueToken('ac')
      await tx.query(
        `INSERT INTO accounts_authorization_codes (code_hash, request_id, user_id, expires_at)
         VALUES (?, ?, ?, ?)`,
        [hashToken(code), requestId, userId, now + this.ttl.codeMs]
      )
      return { code, request: toRequest(row) }
    })
  }

  // Marks the code spent before anything else reads it, so a replay always loses.
  async redeemCode(code: string): Promise<RedeemedCode | null> {
    const now = this.now()
    return await this.database.transaction(async (tx) => {
      const [codeRow] = await tx.query(
        `UPDATE accounts_authorization_codes SET used_at = ?
         WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
         RETURNING request_id, user_id`,
        [now, hashToken(code), now]
      )
      if (!codeRow) return null
      const [requestRow] = await tx.query(
        'SELECT * FROM accounts_authorization_requests WHERE request_id = ?',
        [rowString(codeRow.request_id)]
      )
      if (!requestRow) return null
      return { request: toRequest(requestRow), userId: rowString(codeRow.user_id) }
    })
  }

  async deleteExpired(): Promise<void> {
    const now = this.now()
    await this.database.query('DELETE FROM accounts_authorization_codes WHERE expires_at <= ?', [now])
    await this.database.query('DELETE FROM accounts_authorization_requests WHERE expires_at <= ?', [now])
  }
}
