import { createHash, timingSafeEqual } from 'node:crypto'
import type { CloudDatabase, SqlRow } from '@markov-cloud/cloud-database'
import type { FileStorage } from './file-storage.js'
import { createId, createSalt, deriveReplayToken, hashToken, tokenMatchesHash } from './opaque-token.js'
import type { SkillUploadPolicy } from './skill-cloud-contract.js'
import { SharingError } from './sharing-error.js'
import { rowNumber, rowOptionalNumber, rowOptionalString, rowString } from './sql-row.js'

export const UPLOAD_TOKEN_FIELD = 'uploadToken'
const SWEEP_BATCH = 500

export type SkillUpload = {
  uploadId: string
  ownerUserId: string
  tokenHash: string
  expectedSha256: string
  expectedBytes: number
  expiresAt: number
  uploadedAt: number | null
  finalizedAt: number | null
  packageId: string | null
  versionId: string | null
}

export function skillUploadArchiveKey(uploadId: string): string {
  return `skill-upload/${uploadId}`
}

function toUpload(row: SqlRow): SkillUpload {
  return {
    uploadId: rowString(row.upload_id),
    ownerUserId: rowString(row.owner_user_id),
    tokenHash: rowString(row.token_hash),
    expectedSha256: rowString(row.expected_sha256),
    expectedBytes: rowNumber(row.expected_bytes),
    expiresAt: rowNumber(row.expires_at),
    uploadedAt: rowOptionalNumber(row.uploaded_at),
    finalizedAt: rowOptionalNumber(row.finalized_at),
    packageId: rowOptionalString(row.package_id),
    versionId: rowOptionalString(row.version_id)
  }
}

function requireDeclaredArchive(bytes: Buffer, upload: SkillUpload): void {
  const actual = createHash('sha256').update(bytes).digest()
  const expected = Buffer.from(upload.expectedSha256, 'hex')
  if (bytes.length !== upload.expectedBytes || !timingSafeEqual(actual, expected)) {
    throw new SharingError(400, 'skill_upload_mismatch', 'The archive differs from its declared size or SHA-256.')
  }
}

// The policy POST carries no session, so its form fields hold an upload token only the desktop knows.
export class SkillUploadStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly storage: FileStorage,
    private readonly now: () => number,
    private readonly settings: { publicUrl: string; ttlMs: number }
  ) {}

  async create(
    ownerUserId: string,
    idempotencyKey: string,
    expected: { sha256: string; bytes: number }
  ): Promise<SkillUploadPolicy> {
    const keyHash = hashToken(idempotencyKey)
    for (let attempt = 0; attempt < 2; attempt++) {
      const [existing] = await this.database.query(
        'SELECT * FROM sharing_skill_uploads WHERE owner_user_id = ? AND create_key_hash = ?',
        [ownerUserId, keyHash]
      )
      if (existing) return await this.replay(existing, idempotencyKey, expected)
      const now = this.now()
      const uploadId = createId()
      const salt = createSalt()
      const token = deriveReplayToken('oup', salt, idempotencyKey)
      const expiresAt = now + this.settings.ttlMs
      const [inserted] = await this.database.query(
        `INSERT INTO sharing_skill_uploads
           (upload_id, owner_user_id, create_key_hash, token_salt, token_hash, expected_sha256, expected_bytes,
            expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (owner_user_id, create_key_hash) DO NOTHING`,
        [uploadId, ownerUserId, keyHash, salt, hashToken(token), expected.sha256, expected.bytes, expiresAt, now]
      )
      if (rowNumber(inserted?.changes) === 1) return this.policy(uploadId, token, expiresAt)
    }
    throw new Error('skill_upload_create_conflict')
  }

  async get(uploadId: string): Promise<SkillUpload | null> {
    const [row] = await this.database.query('SELECT * FROM sharing_skill_uploads WHERE upload_id = ?', [uploadId])
    return row ? toUpload(row) : null
  }

  async requirePending(uploadId: string): Promise<SkillUpload> {
    const upload = await this.get(uploadId)
    if (!upload) throw new SharingError(404, 'skill_upload_not_found')
    if (upload.finalizedAt !== null) throw new SharingError(409, 'skill_upload_not_pending')
    if (upload.expiresAt <= this.now()) throw new SharingError(403, 'skill_upload_expired')
    return upload
  }

  async acceptContent(upload: SkillUpload, token: string | undefined, bytes: Buffer | undefined): Promise<void> {
    if (token === undefined || !tokenMatchesHash(token, upload.tokenHash)) {
      throw new SharingError(403, 'skill_upload_forbidden')
    }
    if (!bytes) throw new SharingError(400, 'invalid_request', 'The form needs a file part named "file".')
    requireDeclaredArchive(bytes, upload)
    await this.storage.write(skillUploadArchiveKey(upload.uploadId), bytes)
    await this.database.query(
      'UPDATE sharing_skill_uploads SET uploaded_at = ? WHERE upload_id = ? AND finalized_at IS NULL',
      [this.now(), upload.uploadId]
    )
  }

  // Re-checks the stored bytes, not the upload request, so finalize trusts nothing it did not read.
  async readVerifiedArchive(upload: SkillUpload): Promise<Buffer> {
    const bytes =
      upload.uploadedAt === null ? null : await this.storage.read(skillUploadArchiveKey(upload.uploadId))
    if (!bytes) throw new SharingError(409, 'skill_upload_incomplete', 'The archive has not been uploaded.')
    requireDeclaredArchive(bytes, upload)
    return bytes
  }

  async deleteExpiredPending(): Promise<void> {
    const rows = await this.database.query(
      'SELECT upload_id FROM sharing_skill_uploads WHERE finalized_at IS NULL AND expires_at <= ? LIMIT ?',
      [this.now(), SWEEP_BATCH]
    )
    for (const row of rows) {
      const uploadId = rowString(row.upload_id)
      await this.storage.delete([skillUploadArchiveKey(uploadId)])
      await this.database.query('DELETE FROM sharing_skill_uploads WHERE upload_id = ? AND finalized_at IS NULL', [
        uploadId
      ])
    }
  }

  // A repeated key while pending answers with the same upload and a fresh 30-minute policy.
  private async replay(
    row: SqlRow,
    idempotencyKey: string,
    expected: { sha256: string; bytes: number }
  ): Promise<SkillUploadPolicy> {
    const upload = toUpload(row)
    if (upload.finalizedAt !== null) {
      throw new SharingError(409, 'skill_upload_not_pending', 'Upload is already finalized.')
    }
    if (upload.expectedSha256 !== expected.sha256 || upload.expectedBytes !== expected.bytes) {
      throw new SharingError(409, 'idempotency_key_reused', 'This key was used for a different archive.')
    }
    const expiresAt = this.now() + this.settings.ttlMs
    await this.database.query('UPDATE sharing_skill_uploads SET expires_at = ? WHERE upload_id = ?', [
      expiresAt,
      upload.uploadId
    ])
    const token = deriveReplayToken('oup', rowString(row.token_salt), idempotencyKey)
    return this.policy(upload.uploadId, token, expiresAt)
  }

  private policy(uploadId: string, token: string, expiresAt: number): SkillUploadPolicy {
    return {
      upload: {
        id: uploadId,
        policy: {
          url: `${this.settings.publicUrl}/v1/skill-packages/uploads/${uploadId}/content`,
          fields: { [UPLOAD_TOKEN_FIELD]: token },
          expiresAt: new Date(expiresAt).toISOString()
        }
      }
    }
  }
}
