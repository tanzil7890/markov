import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ID_PATTERN } from './opaque-token.js'

// Ported from src/shared/skill-{bundle,package}-manifest.ts: reject what the desktop refuses to install.

export const BUNDLE_NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/
export const AGENT_PLUGIN_SCHEMA_V1 = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const WINDOWS_RESERVED_SEGMENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const MAX_TOTAL_FILES = 512
const MAX_TOTAL_FILE_BYTES = 32 * 1024 * 1024

const SkillPackageFileSchema = z
  .object({
    path: z.string().min(1).max(1024),
    size: z
      .number()
      .int()
      .nonnegative()
      .max(4 * 1024 * 1024),
    executable: z.boolean(),
    classification: z.enum(['text', 'binary']),
    sha256: z.string().regex(SHA256_PATTERN),
    identitySha256: z.string().regex(SHA256_PATTERN)
  })
  .strict()

type SkillPackageFile = z.infer<typeof SkillPackageFileSchema>

const SkillBundleEntrySchema = z
  .object({
    id: z.string().regex(ID_PATTERN),
    name: z.string(),
    description: z.string().max(4096),
    digest: z.string().regex(SHA256_PATTERN),
    files: z.array(SkillPackageFileSchema).min(1).max(512)
  })
  .strict()

type SkillBundleEntry = z.infer<typeof SkillBundleEntrySchema>

const SkillBundleManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    packageId: z.string().regex(ID_PATTERN),
    versionId: z.string().regex(ID_PATTERN),
    bundleName: z.string().min(1).max(64).regex(BUNDLE_NAME_PATTERN),
    description: z.string().max(4096),
    createdAt: z.iso.datetime({ offset: true }),
    skills: z.array(SkillBundleEntrySchema).min(1).max(512),
    bundleDigest: z.string().regex(SHA256_PATTERN)
  })
  .strict()

export type SkillBundleManifestV1 = z.infer<typeof SkillBundleManifestV1Schema>

const AgentPluginManifestV1Schema = z
  .object({
    $schema: z.literal(AGENT_PLUGIN_SCHEMA_V1),
    name: z.string().min(1).max(64).regex(BUNDLE_NAME_PATTERN),
    version: z.string().optional(),
    description: z.string().optional(),
    author: z
      .object({ name: z.string().optional(), email: z.string().optional(), url: z.string().optional() })
      .strict()
      .optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    extensions: z.record(z.string(), z.record(z.string(), z.unknown())).optional()
  })
  .strict()

export type AgentPluginManifestV1 = z.infer<typeof AgentPluginManifestV1Schema>

function validateSkillName(name: string): void {
  if (!SKILL_NAME_PATTERN.test(name) || WINDOWS_RESERVED_SEGMENT.test(name)) {
    throw new Error('skill-package-skill-name-invalid')
  }
}

function validateSkillPath(path: string): void {
  if (path !== path.normalize('NFC') || Buffer.byteLength(path, 'utf8') > 1024) {
    throw new Error('skill-package-path-invalid')
  }
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new Error('skill-package-path-invalid')
  }
  const segments = path.split('/')
  if (segments.length > 16 || segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('skill-package-path-invalid')
  }
  for (const segment of segments) {
    if (
      Buffer.byteLength(segment, 'utf8') > 255 ||
      [...segment].some((character) => character.charCodeAt(0) <= 0x1f) ||
      ':*?"<>|'.split('').some((character) => segment.includes(character)) ||
      /[ .]$/.test(segment) ||
      WINDOWS_RESERVED_SEGMENT.test(segment)
    ) {
      throw new Error('skill-package-path-invalid')
    }
  }
}

function validateSkillFiles(files: readonly SkillPackageFile[]): void {
  let previousPath: string | null = null
  const foldedPaths = new Set<string>()
  for (const file of files) {
    validateSkillPath(file.path)
    if (previousPath !== null && file.path <= previousPath) {
      throw new Error('skill-bundle-manifest-path-order')
    }
    previousPath = file.path
    const foldedPath = file.path.toLocaleLowerCase('en-US')
    if (foldedPaths.has(foldedPath)) {
      throw new Error('skill-bundle-case-collision')
    }
    foldedPaths.add(foldedPath)
  }
  if (!files.some((file) => file.path === 'SKILL.md')) {
    throw new Error('skill-package-skill-markdown-required')
  }
}

function skillPackageDigest(files: readonly SkillPackageFile[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        files.map((file) => ({
          path: file.path,
          executable: file.executable,
          classification: file.classification,
          identitySha256: file.identitySha256
        }))
      )
    )
    .digest('hex')
}

function skillBundleDigest(skills: readonly SkillBundleEntry[]): string {
  return createHash('sha256')
    .update(JSON.stringify(skills.map((skill) => ({ id: skill.id, name: skill.name, digest: skill.digest }))))
    .digest('hex')
}

export function parseAgentPluginManifest(value: unknown): AgentPluginManifestV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('skill-bundle-plugin-manifest-invalid')
  }
  const candidate = value as Record<string, unknown>
  const extensions =
    candidate.extensions && typeof candidate.extensions === 'object' && !Array.isArray(candidate.extensions)
      ? candidate.extensions
      : undefined
  const parsed = AgentPluginManifestV1Schema.safeParse({
    $schema: candidate.$schema,
    name: candidate.name,
    version: candidate.version,
    description: candidate.description,
    author: candidate.author,
    homepage: candidate.homepage,
    repository: candidate.repository,
    license: candidate.license,
    keywords: candidate.keywords,
    extensions
  })
  if (!parsed.success) {
    throw new Error('skill-bundle-plugin-manifest-invalid')
  }
  return parsed.data
}

export function parseSkillBundleManifest(value: unknown): SkillBundleManifestV1 {
  const parsed = SkillBundleManifestV1Schema.safeParse(value)
  if (!parsed.success) {
    throw new Error('skill-bundle-manifest-invalid')
  }
  const foldedNames = new Set<string>()
  const ids = new Set<string>()
  let totalFiles = 0
  let totalBytes = 0
  let previousName: string | null = null
  for (const skill of parsed.data.skills) {
    validateSkillName(skill.name)
    if (previousName !== null && skill.name <= previousName) {
      throw new Error('skill-bundle-skill-order')
    }
    previousName = skill.name
    const foldedName = skill.name.toLocaleLowerCase('en-US')
    if (foldedNames.has(foldedName) || ids.has(skill.id)) {
      throw new Error('skill-bundle-skill-collision')
    }
    foldedNames.add(foldedName)
    ids.add(skill.id)
    validateSkillFiles(skill.files)
    if (skillPackageDigest(skill.files) !== skill.digest) {
      throw new Error('skill-bundle-skill-digest-mismatch')
    }
    totalFiles += skill.files.length
    totalBytes += skill.files.reduce((sum, file) => sum + file.size, 0)
    if (totalFiles > MAX_TOTAL_FILES || totalBytes > MAX_TOTAL_FILE_BYTES) {
      throw new Error('skill-bundle-content-limit')
    }
  }
  if (skillBundleDigest(parsed.data.skills) !== parsed.data.bundleDigest) {
    throw new Error('skill-bundle-digest-mismatch')
  }
  return parsed.data
}
