import type { CloudDatabase, SqlRow } from '@markov-cloud/cloud-database'
import { z } from 'zod'
import { renderArtifactHtml } from './artifact-page.js'
import type { FileStorage, StoredFileStream } from './file-storage.js'
import { createId, createSalt, deriveReplayToken, hashToken, tokenMatchesHash } from './opaque-token.js'
import { SharingError } from './sharing-error.js'
import { rowNumber, rowOptionalNumber, rowOptionalString, rowString } from './sql-row.js'

const MAX_CONTENT_BYTES = 10 * 1024 * 1024
const PAGE_SIZE = 50
const SWEEP_BATCH = 500

// Mirrors the desktop's ArtifactWriteBody in src/main/artifacts/artifact-cloud-request.ts.
export const ArtifactWriteSchema = z.object({
  content: z.string(),
  contentType: z.enum(['text/html', 'text/markdown']),
  fileName: z.string().min(1).max(1024),
  title: z.string().max(1024).optional()
})
export type ArtifactWrite = z.infer<typeof ArtifactWriteSchema>

// Mirrors ArtifactMetadata in src/shared/artifacts.ts.
export type ArtifactMetadata = {
  version: 1
  slug: string
  title: string | null
  originalFileName: string | null
  sourceContentType: string
  renderedContentType: 'text/html'
  createdAt: string
  updatedAt: string
  expiresAt: string
  byteSize: number
  deletedAt: string | null
}

export type ArtifactListItem = { artifact: ArtifactMetadata; shareUrl: string }
export type ArtifactCreateResponse = ArtifactListItem & { editToken: string }
export type ArtifactListPage = { artifacts: ArtifactListItem[]; nextCursor?: string }

type ArtifactSettings = { publicUrl: string; ttlMs: number; retentionMs: number }

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function toMetadata(row: SqlRow): ArtifactMetadata {
  const deletedAt = rowOptionalNumber(row.deleted_at)
  return {
    version: 1,
    slug: rowString(row.slug),
    title: rowOptionalString(row.title),
    originalFileName: rowOptionalString(row.original_file_name),
    sourceContentType: rowString(row.source_content_type),
    renderedContentType: 'text/html',
    createdAt: iso(rowNumber(row.created_at)),
    updatedAt: iso(rowNumber(row.updated_at)),
    expiresAt: iso(rowNumber(row.expires_at)),
    byteSize: rowNumber(row.byte_size),
    deletedAt: deletedAt === null ? null : iso(deletedAt)
  }
}

function encodeCursor(row: SqlRow): string {
  return Buffer.from(JSON.stringify([rowNumber(row.created_at), rowString(row.slug)])).toString('base64url')
}

function decodeCursor(cursor: string): { createdAt: number; slug: string } {
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw new SharingError(400, 'invalid_cursor')
  }
  if (!Array.isArray(value) || !Number.isSafeInteger(value[0]) || typeof value[1] !== 'string') {
    throw new SharingError(400, 'invalid_cursor')
  }
  return { createdAt: value[0] as number, slug: value[1] }
}

function renderedBytes(write: ArtifactWrite): { html: Buffer; byteSize: number } {
  const byteSize = Buffer.byteLength(write.content, 'utf8')
  if (byteSize > MAX_CONTENT_BYTES) {
    throw new SharingError(413, 'artifact_too_large', 'Artifact content is limited to 10 MiB.')
  }
  const html = renderArtifactHtml({
    content: write.content,
    contentType: write.contentType,
    title: write.title || null,
    fileName: write.fileName
  })
  return { html: Buffer.from(html, 'utf8'), byteSize }
}

export class ArtifactStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly storage: FileStorage,
    private readonly now: () => number,
    private readonly settings: ArtifactSettings
  ) {}

  private shareUrl(slug: string): string {
    return `${this.settings.publicUrl}/a/${slug}`
  }

  // A replayed key answers with the original response, before any of today's validation runs.
  async findCreated(ownerUserId: string, idempotencyKey: string): Promise<ArtifactCreateResponse | null> {
    const [row] = await this.database.query(
      'SELECT create_response, edit_salt FROM sharing_artifacts WHERE owner_user_id = ? AND create_key_hash = ?',
      [ownerUserId, hashToken(idempotencyKey)]
    )
    if (!row) return null
    const original = JSON.parse(rowString(row.create_response)) as ArtifactListItem
    return { ...original, editToken: deriveReplayToken('oet', rowString(row.edit_salt), idempotencyKey) }
  }

  async create(
    ownerUserId: string,
    idempotencyKey: string,
    write: ArtifactWrite
  ): Promise<ArtifactCreateResponse> {
    const { html, byteSize } = renderedBytes(write)
    const now = this.now()
    const slug = createId()
    const salt = createSalt()
    const editToken = deriveReplayToken('oet', salt, idempotencyKey)
    const contentKey = `artifact/${slug}/${createId()}`
    const artifact: ArtifactMetadata = {
      version: 1,
      slug,
      title: write.title || null,
      originalFileName: write.fileName,
      sourceContentType: write.contentType,
      renderedContentType: 'text/html',
      createdAt: iso(now),
      updatedAt: iso(now),
      expiresAt: iso(now + this.settings.ttlMs),
      byteSize,
      deletedAt: null
    }
    const original: ArtifactListItem = { artifact, shareUrl: this.shareUrl(slug) }
    await this.storage.write(contentKey, html)
    const [inserted] = await this.database.query(
      `INSERT INTO sharing_artifacts
         (slug, owner_user_id, create_key_hash, create_response, edit_salt, edit_token_hash, content_key,
          title, original_file_name, source_content_type, byte_size, created_at, updated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (owner_user_id, create_key_hash) DO NOTHING`,
      [
        slug,
        ownerUserId,
        hashToken(idempotencyKey),
        JSON.stringify(original),
        salt,
        hashToken(editToken),
        contentKey,
        artifact.title,
        artifact.originalFileName,
        artifact.sourceContentType,
        byteSize,
        now,
        now,
        now + this.settings.ttlMs
      ]
    )
    if (rowNumber(inserted?.changes) === 1) return { ...original, editToken }
    // A concurrent request with the same key won; answer with its artifact.
    await this.storage.delete([contentKey])
    const winner = await this.findCreated(ownerUserId, idempotencyKey)
    if (!winner) throw new Error('artifact_create_conflict')
    return winner
  }

  async update(slug: string, editToken: string, write: ArtifactWrite): Promise<ArtifactListItem> {
    const row = await this.liveRow(slug)
    if (!tokenMatchesHash(editToken, rowString(row.edit_token_hash))) {
      throw new SharingError(403, 'artifact_forbidden')
    }
    const { html, byteSize } = renderedBytes(write)
    const now = this.now()
    const previousKey = rowString(row.content_key)
    const contentKey = `artifact/${slug}/${createId()}`
    await this.storage.write(contentKey, html)
    const [updated] = await this.database.query(
      `UPDATE sharing_artifacts
       SET content_key = ?, title = ?, original_file_name = ?, source_content_type = ?, byte_size = ?,
           updated_at = ?, expires_at = ?
       WHERE slug = ? AND content_key = ? AND deleted_at IS NULL
       RETURNING *`,
      [
        contentKey,
        write.title || null,
        write.fileName,
        write.contentType,
        byteSize,
        now,
        now + this.settings.ttlMs,
        slug,
        previousKey
      ]
    )
    if (!updated) {
      await this.storage.delete([contentKey])
      throw new SharingError(409, 'artifact_conflict', 'The artifact changed during the update.')
    }
    await this.storage.delete([previousKey])
    return { artifact: toMetadata(updated), shareUrl: this.shareUrl(slug) }
  }

  // The owner may always delete; anyone holding the edit token may too.
  async delete(slug: string, callerUserId: string, editToken: string | undefined): Promise<void> {
    const row = await this.liveRow(slug)
    const authorized =
      rowString(row.owner_user_id) === callerUserId ||
      (editToken !== undefined && tokenMatchesHash(editToken, rowString(row.edit_token_hash)))
    if (!authorized) throw new SharingError(403, 'artifact_forbidden')
    await this.database.query(
      'UPDATE sharing_artifacts SET deleted_at = ? WHERE slug = ? AND deleted_at IS NULL',
      [this.now(), slug]
    )
    await this.storage.delete([rowString(row.content_key)])
  }

  async list(ownerUserId: string, cursor: string | undefined): Promise<ArtifactListPage> {
    const after = cursor ? decodeCursor(cursor) : null
    const rows = await this.database.query(
      `SELECT * FROM sharing_artifacts
       WHERE owner_user_id = ? AND deleted_at IS NULL AND expires_at > ?
         ${after ? 'AND (created_at < ? OR (created_at = ? AND slug < ?))' : ''}
       ORDER BY created_at DESC, slug DESC
       LIMIT ?`,
      [ownerUserId, this.now(), ...(after ? [after.createdAt, after.createdAt, after.slug] : []), PAGE_SIZE + 1]
    )
    const page = rows.slice(0, PAGE_SIZE)
    const last = page.at(-1)
    return {
      artifacts: page.map((row) => ({ artifact: toMetadata(row), shareUrl: this.shareUrl(rowString(row.slug)) })),
      ...(rows.length > PAGE_SIZE && last ? { nextCursor: encodeCursor(last) } : {})
    }
  }

  async openPublicPage(slug: string): Promise<StoredFileStream | null> {
    const [row] = await this.database.query(
      'SELECT content_key FROM sharing_artifacts WHERE slug = ? AND deleted_at IS NULL AND expires_at > ?',
      [slug, this.now()]
    )
    return row ? await this.storage.stream(rowString(row.content_key)) : null
  }

  // Rows outlive expiry by the retention window so idempotent create replays keep working.
  async deleteExpired(): Promise<void> {
    const rows = await this.database.query(
      'SELECT slug, content_key FROM sharing_artifacts WHERE expires_at <= ? LIMIT ?',
      [this.now() - this.settings.retentionMs, SWEEP_BATCH]
    )
    for (const row of rows) {
      await this.storage.delete([rowString(row.content_key)])
      await this.database.query('DELETE FROM sharing_artifacts WHERE slug = ?', [rowString(row.slug)])
    }
  }

  private async liveRow(slug: string): Promise<SqlRow> {
    const [row] = await this.database.query('SELECT * FROM sharing_artifacts WHERE slug = ?', [slug])
    if (!row || rowOptionalNumber(row.deleted_at) !== null) {
      throw new SharingError(404, 'artifact_not_found')
    }
    return row
  }
}
