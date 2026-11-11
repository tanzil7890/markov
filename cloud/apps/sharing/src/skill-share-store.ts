import type { CloudDatabase } from '@markov-cloud/cloud-database'
import type { FileStorage, StoredFileStream } from './file-storage.js'
import { createId, createOpaqueToken, hashToken } from './opaque-token.js'
import type {
  SkillCloudDownloadGrant,
  SkillCloudOwnedShare,
  SkillCloudShare,
  SkillCloudVersion
} from './skill-cloud-contract.js'
import type { SkillPackageStore } from './skill-package-store.js'
import { SharingError } from './sharing-error.js'
import { rowNumber, rowOptionalString, rowString } from './sql-row.js'

type LiveShare = { shareId: string; packageId: string; pinnedVersionId: string | null }

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

// Share links are public: anyone holding one may resolve it and mint short-lived download grants.
export class SkillShareStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly storage: FileStorage,
    private readonly packages: SkillPackageStore,
    private readonly now: () => number,
    private readonly settings: { publicUrl: string; grantTtlMs: number }
  ) {}

  async create(
    ownerUserId: string,
    packageId: string,
    idempotencyKey: string,
    pinnedVersionId: string | undefined
  ): Promise<SkillCloudShare> {
    const keyHash = hashToken(idempotencyKey)
    for (let attempt = 0; attempt < 2; attempt++) {
      const [existing] = await this.database.query(
        'SELECT share_id FROM sharing_skill_shares WHERE owner_user_id = ? AND create_key_hash = ?',
        [ownerUserId, keyHash]
      )
      if (existing) return this.shareResponse(rowString(existing.share_id))
      await this.packages.ownedLivePackage(packageId, ownerUserId)
      if (pinnedVersionId && !(await this.packages.version(packageId, pinnedVersionId))) {
        throw new SharingError(404, 'skill_version_not_found')
      }
      const shareId = createId()
      const [inserted] = await this.database.query(
        `INSERT INTO sharing_skill_shares
           (share_id, package_id, owner_user_id, create_key_hash, pinned_version_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (owner_user_id, create_key_hash) DO NOTHING`,
        [shareId, packageId, ownerUserId, keyHash, pinnedVersionId ?? null, this.now()]
      )
      if (rowNumber(inserted?.changes) === 1) return this.shareResponse(shareId)
    }
    throw new Error('skill_share_create_conflict')
  }

  // Unpinned shares follow the package to its newest version at resolve time.
  async resolve(shareId: string): Promise<{ id: string; version: SkillCloudVersion }> {
    const share = await this.liveShare(shareId)
    return { id: share.shareId, version: await this.shareVersion(share, undefined) }
  }

  async listOwned(ownerUserId: string): Promise<SkillCloudOwnedShare[]> {
    const rows = await this.database.query(
      `SELECT s.share_id, s.package_id, s.created_at, p.name, p.description
       FROM sharing_skill_shares s JOIN sharing_skill_packages p ON p.package_id = s.package_id
       WHERE s.owner_user_id = ? AND s.revoked_at IS NULL AND p.deleted_at IS NULL
       ORDER BY s.created_at DESC`,
      [ownerUserId]
    )
    return rows.map((row) => ({
      ...this.shareResponse(rowString(row.share_id)),
      packageId: rowString(row.package_id),
      name: rowString(row.name),
      description: rowString(row.description),
      createdAt: iso(rowNumber(row.created_at))
    }))
  }

  async revoke(shareId: string, ownerUserId: string): Promise<void> {
    const [row] = await this.database.query(
      'SELECT revoked_at FROM sharing_skill_shares WHERE share_id = ? AND owner_user_id = ?',
      [shareId, ownerUserId]
    )
    if (!row) throw new SharingError(404, 'skill_share_not_found')
    await this.database.query(
      'UPDATE sharing_skill_shares SET revoked_at = ? WHERE share_id = ? AND revoked_at IS NULL',
      [this.now(), shareId]
    )
  }

  async grantForShare(shareId: string, versionId: string | undefined): Promise<SkillCloudDownloadGrant> {
    const share = await this.liveShare(shareId)
    return await this.issueGrant(await this.shareVersion(share, versionId), share.shareId)
  }

  async grantForPackageVersion(
    callerUserId: string,
    packageId: string,
    versionId: string
  ): Promise<SkillCloudDownloadGrant> {
    const found = await this.packages.livePackage(packageId)
    if (!found || (found.ownerUserId !== callerUserId && !(await this.packages.hasLiveShare(packageId)))) {
      throw new SharingError(404, 'skill_package_not_found')
    }
    const version = await this.packages.version(packageId, versionId)
    if (!version) throw new SharingError(404, 'skill_version_not_found')
    return await this.issueGrant(version, null)
  }

  // A grant minted from a share stops working the moment that share is revoked.
  async openDownload(grantToken: string): Promise<StoredFileStream | null> {
    const [row] = await this.database.query(
      `SELECT v.archive_key FROM sharing_skill_grants g
       JOIN sharing_skill_versions v ON v.package_id = g.package_id AND v.version_id = g.version_id
       JOIN sharing_skill_packages p ON p.package_id = g.package_id
       LEFT JOIN sharing_skill_shares s ON s.share_id = g.share_id
       WHERE g.token_hash = ? AND g.expires_at > ? AND p.deleted_at IS NULL
         AND (g.share_id IS NULL OR s.revoked_at IS NULL)`,
      [hashToken(grantToken), this.now()]
    )
    return row ? await this.storage.stream(rowString(row.archive_key)) : null
  }

  async deleteExpiredGrants(): Promise<void> {
    await this.database.query('DELETE FROM sharing_skill_grants WHERE expires_at <= ?', [this.now()])
  }

  private shareResponse(shareId: string): SkillCloudShare {
    return { id: shareId, url: this.packages.shareUrl(shareId) }
  }

  private async liveShare(shareId: string): Promise<LiveShare> {
    const [row] = await this.database.query(
      `SELECT s.share_id, s.package_id, s.pinned_version_id FROM sharing_skill_shares s
       JOIN sharing_skill_packages p ON p.package_id = s.package_id
       WHERE s.share_id = ? AND s.revoked_at IS NULL AND p.deleted_at IS NULL`,
      [shareId]
    )
    if (!row) throw new SharingError(404, 'skill_share_not_found')
    return {
      shareId: rowString(row.share_id),
      packageId: rowString(row.package_id),
      pinnedVersionId: rowOptionalString(row.pinned_version_id)
    }
  }

  private async shareVersion(
    share: LiveShare,
    requestedVersionId: string | undefined
  ): Promise<SkillCloudVersion> {
    if (requestedVersionId && share.pinnedVersionId && requestedVersionId !== share.pinnedVersionId) {
      throw new SharingError(403, 'skill_version_not_shared', 'This share is pinned to another version.')
    }
    const versionId = requestedVersionId ?? share.pinnedVersionId
    const version = versionId
      ? await this.packages.version(share.packageId, versionId)
      : await this.packages.newestVersion(share.packageId)
    if (!version) throw new SharingError(404, 'skill_version_not_found')
    return version
  }

  private async issueGrant(version: SkillCloudVersion, shareId: string | null): Promise<SkillCloudDownloadGrant> {
    const now = this.now()
    const token = createOpaqueToken('odg')
    const expiresAt = now + this.settings.grantTtlMs
    await this.database.query(
      `INSERT INTO sharing_skill_grants (token_hash, package_id, version_id, share_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [hashToken(token), version.packageId, version.versionId, shareId, expiresAt, now]
    )
    return {
      grant: { url: `${this.settings.publicUrl}/v1/skill-downloads/${token}`, expiresAt: iso(expiresAt) },
      version
    }
  }
}
