import type { CloudDatabase, SqlRow } from '@markov-cloud/cloud-database'
import type { FileStorage } from './file-storage.js'
import type { SkillBundleManifestV1 } from './skill-bundle-manifest.js'
import type { SkillCloudPackageDetails, SkillCloudVersion } from './skill-cloud-contract.js'
import { skillUploadArchiveKey, type SkillUpload } from './skill-upload-store.js'
import { SharingError } from './sharing-error.js'
import { rowNumber, rowOptionalNumber, rowOptionalString, rowString } from './sql-row.js'

export type SkillPackage = {
  packageId: string
  ownerUserId: string
  name: string
  description: string
  createdAt: number
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

function toVersion(row: SqlRow): SkillCloudVersion {
  return {
    packageId: rowString(row.package_id),
    versionId: rowString(row.version_id),
    name: rowString(row.name),
    description: rowString(row.description),
    packageDigest: rowString(row.package_digest),
    archiveSha256: rowString(row.archive_sha256),
    compressedBytes: rowNumber(row.compressed_bytes),
    createdAt: iso(rowNumber(row.created_at)),
    releaseNotes: rowString(row.release_notes),
    manifest: JSON.parse(rowString(row.manifest)) as SkillBundleManifestV1
  }
}

function toPackage(row: SqlRow): SkillPackage {
  return {
    packageId: rowString(row.package_id),
    ownerUserId: rowString(row.owner_user_id),
    name: rowString(row.name),
    description: rowString(row.description),
    createdAt: rowNumber(row.created_at)
  }
}

export class SkillPackageStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly storage: FileStorage,
    private readonly now: () => number,
    private readonly settings: { publicUrl: string }
  ) {}

  shareUrl(shareId: string): string {
    return `${this.settings.publicUrl}/skills/share/${shareId}`
  }

  async findOwnedByName(ownerUserId: string, name: string): Promise<string | null> {
    const [row] = await this.database.query(
      `SELECT package_id FROM sharing_skill_packages
       WHERE owner_user_id = ? AND name = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [ownerUserId, name]
    )
    return row ? rowString(row.package_id) : null
  }

  async livePackage(packageId: string): Promise<SkillPackage | null> {
    const [row] = await this.database.query(
      'SELECT * FROM sharing_skill_packages WHERE package_id = ? AND deleted_at IS NULL',
      [packageId]
    )
    return row ? toPackage(row) : null
  }

  async ownedLivePackage(packageId: string, callerUserId: string): Promise<SkillPackage> {
    const found = await this.livePackage(packageId)
    if (!found) throw new SharingError(404, 'skill_package_not_found')
    if (found.ownerUserId !== callerUserId) throw new SharingError(403, 'skill_package_not_owned')
    return found
  }

  async hasLiveShare(packageId: string): Promise<boolean> {
    const [row] = await this.database.query(
      'SELECT 1 AS present FROM sharing_skill_shares WHERE package_id = ? AND revoked_at IS NULL LIMIT 1',
      [packageId]
    )
    return row !== undefined
  }

  async version(packageId: string, versionId: string): Promise<SkillCloudVersion | null> {
    const [row] = await this.database.query(
      'SELECT * FROM sharing_skill_versions WHERE package_id = ? AND version_id = ?',
      [packageId, versionId]
    )
    return row ? toVersion(row) : null
  }

  async newestVersion(packageId: string): Promise<SkillCloudVersion | null> {
    const [row] = await this.database.query(
      `SELECT * FROM sharing_skill_versions WHERE package_id = ?
       ORDER BY created_at DESC, version_id DESC LIMIT 1`,
      [packageId]
    )
    return row ? toVersion(row) : null
  }

  // packageId and versionId come only from the verified manifest inside the archive.
  async publish(input: {
    upload: SkillUpload
    manifest: SkillBundleManifestV1
    releaseNotes: string
  }): Promise<SkillCloudVersion> {
    const { upload, manifest } = input
    const archiveKey = skillUploadArchiveKey(upload.uploadId)
    const published = await this.database.transaction(async (tx) => {
      const now = this.now()
      // Package lock first, owner lock second, so two finalizes never wait on each other in a cycle.
      await tx.lockQuotaScope(`sharing-skill-package:${manifest.packageId}`)
      await tx.lockQuotaScope(`sharing-skill-owner:${upload.ownerUserId}`)
      const [current] = await tx.query(
        'SELECT finalized_at, package_id, version_id FROM sharing_skill_uploads WHERE upload_id = ?',
        [upload.uploadId]
      )
      if (!current) throw new SharingError(404, 'skill_upload_not_found')
      if (rowOptionalNumber(current.finalized_at) !== null) {
        return {
          packageId: rowString(current.package_id),
          versionId: rowString(current.version_id),
          duplicateArchive: false
        }
      }
      const [existing] = await tx.query('SELECT * FROM sharing_skill_packages WHERE package_id = ?', [
        manifest.packageId
      ])
      if (existing && rowString(existing.owner_user_id) !== upload.ownerUserId) {
        throw new SharingError(403, 'skill_package_not_owned')
      }
      const [nameTaken] = await tx.query(
        `SELECT 1 AS present FROM sharing_skill_packages
         WHERE owner_user_id = ? AND name = ? AND package_id <> ? AND deleted_at IS NULL`,
        [upload.ownerUserId, manifest.bundleName, manifest.packageId]
      )
      if (nameTaken) {
        throw new SharingError(409, 'skill_package_name_taken', 'Another of your shared packages has this name.')
      }
      if (!existing) {
        await tx.query(
          `INSERT INTO sharing_skill_packages (package_id, owner_user_id, name, description, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [manifest.packageId, upload.ownerUserId, manifest.bundleName, manifest.description, now]
        )
      } else {
        const revived = rowOptionalNumber(existing.deleted_at) !== null
        await tx.query(
          `UPDATE sharing_skill_packages SET name = ?, description = ?, deleted_at = NULL, created_at = ?
           WHERE package_id = ?`,
          [
            manifest.bundleName,
            manifest.description,
            revived ? now : rowNumber(existing.created_at),
            manifest.packageId
          ]
        )
      }
      const [sameVersion] = await tx.query(
        'SELECT archive_sha256 FROM sharing_skill_versions WHERE package_id = ? AND version_id = ?',
        [manifest.packageId, manifest.versionId]
      )
      if (sameVersion && rowString(sameVersion.archive_sha256) !== upload.expectedSha256) {
        throw new SharingError(409, 'skill_version_exists', 'This version id was published with other content.')
      }
      if (!sameVersion) {
        await tx.query(
          `INSERT INTO sharing_skill_versions
             (package_id, version_id, name, description, package_digest, archive_sha256, compressed_bytes,
              archive_key, release_notes, manifest, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            manifest.packageId,
            manifest.versionId,
            manifest.bundleName,
            manifest.description,
            manifest.bundleDigest,
            upload.expectedSha256,
            upload.expectedBytes,
            archiveKey,
            input.releaseNotes,
            JSON.stringify(manifest),
            now
          ]
        )
      }
      await tx.query(
        'UPDATE sharing_skill_uploads SET finalized_at = ?, package_id = ?, version_id = ? WHERE upload_id = ?',
        [now, manifest.packageId, manifest.versionId, upload.uploadId]
      )
      return {
        packageId: manifest.packageId,
        versionId: manifest.versionId,
        duplicateArchive: Boolean(sameVersion)
      }
    })
    // The same archive already backs this version through an earlier upload.
    if (published.duplicateArchive) await this.storage.delete([archiveKey])
    const version = await this.version(published.packageId, published.versionId)
    if (!version) throw new SharingError(404, 'skill_version_not_found')
    return version
  }

  // Owners get management; other signed-in users see a package only while it is shared.
  async details(packageId: string, callerUserId: string): Promise<SkillCloudPackageDetails> {
    const found = await this.livePackage(packageId)
    const canManage = found?.ownerUserId === callerUserId
    if (!found || (!canManage && !(await this.hasLiveShare(packageId)))) {
      throw new SharingError(404, 'skill_package_not_found')
    }
    const versions = await this.database.query(
      'SELECT * FROM sharing_skill_versions WHERE package_id = ? ORDER BY created_at DESC, version_id DESC',
      [packageId]
    )
    const details: SkillCloudPackageDetails = {
      id: found.packageId,
      name: found.name,
      description: found.description,
      createdAt: iso(found.createdAt),
      canManage,
      versions: versions.map(toVersion)
    }
    if (!canManage) return details
    const shares = await this.database.query(
      `SELECT share_id, pinned_version_id, created_at FROM sharing_skill_shares
       WHERE package_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`,
      [packageId]
    )
    return {
      ...details,
      management: {
        shares: shares.map((row) => {
          const pinnedVersionId = rowOptionalString(row.pinned_version_id)
          return {
            id: rowString(row.share_id),
            url: this.shareUrl(rowString(row.share_id)),
            ...(pinnedVersionId ? { pinnedVersionId } : {}),
            createdAt: iso(rowNumber(row.created_at))
          }
        })
      }
    }
  }

  async delete(packageId: string, callerUserId: string): Promise<void> {
    const archiveKeys = await this.database.transaction(async (tx) => {
      const now = this.now()
      const [found] = await tx.query(
        'SELECT owner_user_id FROM sharing_skill_packages WHERE package_id = ? AND deleted_at IS NULL',
        [packageId]
      )
      if (!found) throw new SharingError(404, 'skill_package_not_found')
      if (rowString(found.owner_user_id) !== callerUserId) throw new SharingError(403, 'skill_package_not_owned')
      // The row stays as a tombstone so nobody else can claim this package id.
      await tx.query('UPDATE sharing_skill_packages SET deleted_at = ? WHERE package_id = ?', [now, packageId])
      await tx.query(
        'UPDATE sharing_skill_shares SET revoked_at = ? WHERE package_id = ? AND revoked_at IS NULL',
        [now, packageId]
      )
      await tx.query('DELETE FROM sharing_skill_grants WHERE package_id = ?', [packageId])
      const versions = await tx.query('SELECT archive_key FROM sharing_skill_versions WHERE package_id = ?', [
        packageId
      ])
      await tx.query('DELETE FROM sharing_skill_versions WHERE package_id = ?', [packageId])
      await tx.query('DELETE FROM sharing_skill_uploads WHERE package_id = ?', [packageId])
      return versions.map((row) => rowString(row.archive_key))
    })
    await this.storage.delete(archiveKeys)
  }
}
