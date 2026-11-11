import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import {
  parseAgentPluginManifest,
  parseSkillBundleManifest,
  type SkillBundleManifestV1
} from './skill-bundle-manifest.js'

const gunzipAsync = promisify(gunzip)

// Same envelope and limits as the desktop's extractSkillBundleArchive (src/main/skills).
const TAR_BLOCK_BYTES = 512
const TAR_EXPANDED_LIMIT = 40 * 1024 * 1024
const MAX_MANIFEST_BYTES = 1024 * 1024
const PLUGIN_MANIFEST_PATH = 'plugin.json'
const BUNDLE_MANIFEST_PATH = 'dev.markov.skill-sharing/manifest.json'

type TarEntry = { path: string; size: number; executable: boolean }

class TarCursor {
  private offset = 0

  constructor(private readonly bytes: Buffer) {}

  get remaining(): number {
    return this.bytes.length - this.offset
  }

  take(length: number): Buffer {
    if (length > this.remaining) throw new Error('skill-package-tar-truncated')
    const slice = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }
}

function readString(header: Buffer, offset: number, length: number): string {
  const end = header.indexOf(0, offset)
  return header.subarray(offset, end === -1 || end > offset + length ? offset + length : end).toString('utf8')
}

function readOctal(header: Buffer, offset: number, length: number): number {
  const value = readString(header, offset, length).trim()
  if (!/^[0-7]+$/.test(value)) throw new Error('skill-package-tar-number-invalid')
  const parsed = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(parsed)) throw new Error('skill-package-tar-number-invalid')
  return parsed
}

function isZeroBlock(block: Buffer): boolean {
  return block.every((byte) => byte === 0)
}

// ustar splits long paths into a 155-byte prefix and a 100-byte name.
function parseTarHeader(header: Buffer): TarEntry | null {
  if (isZeroBlock(header)) return null
  const expectedChecksum = readOctal(header, 148, 8)
  const copy = Buffer.from(header)
  copy.fill(0x20, 148, 156)
  if (copy.reduce((sum, byte) => sum + byte, 0) !== expectedChecksum) {
    throw new Error('skill-package-tar-checksum-invalid')
  }
  if (readString(header, 257, 6) !== 'ustar' || readString(header, 263, 2) !== '00') {
    throw new Error('skill-package-tar-format-invalid')
  }
  const type = header[156]
  if (type !== 0 && type !== '0'.charCodeAt(0)) throw new Error('skill-package-tar-entry-type')
  const name = readString(header, 0, 100)
  const prefix = readString(header, 345, 155)
  const path = prefix ? `${prefix}/${name}` : name
  if (!path) throw new Error('skill-package-tar-path-invalid')
  const mode = readOctal(header, 100, 8)
  return { path, size: readOctal(header, 124, 12), executable: (mode & 0o111) !== 0 }
}

function readEntryHeader(cursor: TarCursor): TarEntry | null {
  return parseTarHeader(cursor.take(TAR_BLOCK_BYTES))
}

function skipPadding(cursor: TarCursor, size: number): void {
  const padding = (TAR_BLOCK_BYTES - (size % TAR_BLOCK_BYTES)) % TAR_BLOCK_BYTES
  if (padding > 0 && !isZeroBlock(cursor.take(padding))) {
    throw new Error('skill-package-tar-padding-invalid')
  }
}

function readJsonEntry(cursor: TarCursor, expectedPath: string): unknown {
  const header = readEntryHeader(cursor)
  if (!header || header.path !== expectedPath || header.executable || header.size > MAX_MANIFEST_BYTES) {
    throw new Error('skill-bundle-manifest-envelope-invalid')
  }
  const bytes = cursor.take(header.size)
  skipPadding(cursor, header.size)
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error('skill-bundle-manifest-invalid')
  }
}

function requireArchiveEnd(cursor: TarCursor): void {
  for (let index = 0; index < 2; index++) {
    if (!isZeroBlock(cursor.take(TAR_BLOCK_BYTES))) throw new Error('skill-package-tar-trailing-entry')
  }
  while (cursor.remaining > 0) {
    if (!isZeroBlock(cursor.take(TAR_BLOCK_BYTES))) {
      throw new Error('skill-package-tar-trailing-data')
    }
  }
}

export async function inspectSkillBundleArchive(archive: Buffer): Promise<SkillBundleManifestV1> {
  let tar: Buffer
  try {
    tar = await gunzipAsync(archive, { maxOutputLength: TAR_EXPANDED_LIMIT })
  } catch {
    throw new Error('skill-package-gzip-invalid')
  }
  const cursor = new TarCursor(tar)
  const plugin = parseAgentPluginManifest(readJsonEntry(cursor, PLUGIN_MANIFEST_PATH))
  const manifest = parseSkillBundleManifest(readJsonEntry(cursor, BUNDLE_MANIFEST_PATH))
  if (plugin.name !== manifest.bundleName || plugin.version !== manifest.versionId) {
    throw new Error('skill-bundle-identity-mismatch')
  }
  for (const skill of manifest.skills) {
    for (const file of skill.files) {
      const header = readEntryHeader(cursor)
      if (
        !header ||
        header.path !== `skills/${skill.name}/${file.path}` ||
        header.size !== file.size ||
        header.executable !== file.executable
      ) {
        throw new Error('skill-bundle-file-envelope-mismatch')
      }
      if (createHash('sha256').update(cursor.take(file.size)).digest('hex') !== file.sha256) {
        throw new Error('skill-package-file-digest-mismatch')
      }
      skipPadding(cursor, file.size)
    }
  }
  requireArchiveEnd(cursor)
  return manifest
}
