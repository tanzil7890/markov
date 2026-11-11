import type { SkillBundleManifestV1 } from './skill-bundle-manifest.js'

// Mirrors src/shared/skill-cloud-contract.ts; the desktop reads these field names verbatim.

export type SkillCloudVersion = {
  packageId: string
  versionId: string
  name: string
  description: string
  packageDigest: string
  archiveSha256: string
  compressedBytes: number
  createdAt: string
  releaseNotes: string
  manifest: SkillBundleManifestV1
}

export type SkillCloudShare = { id: string; url: string }

export type SkillCloudOwnedShare = SkillCloudShare & {
  packageId: string
  name: string
  description: string
  createdAt: string
}

export type SkillCloudDownloadGrant = {
  grant: { url: string; expiresAt: string }
  version: SkillCloudVersion
}

export type SkillCloudPackageDetails = {
  id: string
  name: string
  description: string
  createdAt: string
  canManage: boolean
  versions: SkillCloudVersion[]
  management?: {
    shares: { id: string; url: string; pinnedVersionId?: string; createdAt: string }[]
  }
}

export type SkillUploadPolicy = {
  upload: { id: string; policy: { url: string; fields: Record<string, string>; expiresAt: string } }
}
