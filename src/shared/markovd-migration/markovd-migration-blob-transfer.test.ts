import { describe, expect, it } from 'vitest'
import {
  MAX_MARKOVD_MIGRATION_BLOB_TOTAL_BYTES,
  MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS,
  advertisedMarkovdMigrationBlobCapabilities,
  MarkovdMigrationBlobChunkRequestSchema,
  MarkovdMigrationBlobDescriptorSchema,
  assertMarkovdMigrationBlobSet,
  findUnsupportedMigrationBlobKind,
  markovdMigrationBlobKindUnsupportedBlocker,
  parseMarkovdMigrationBlobChunkResult,
  parseMarkovdMigrationBlobDescriptor,
  parseMarkovdMigrationBlobUploadStates,
  requiredMigrationBlobCapabilities,
  type MarkovdMigrationBlobDescriptor
} from './markovd-migration-blob-transfer'
import { parseMarkovdMigrationCatalogState } from './markovd-migration-catalog-state'
import { MARKOVD_MIGRATION_MANIFEST_VERSION } from './markovd-migration-manifest-validation'
import type { MarkovdMigrationManifest } from './markovd-migration-manifest'
import { MARKOVD_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY } from '../markovd-runtime-capabilities'

const HASH = 'a'.repeat(16)
const DIGEST = 'b'.repeat(64)

function blob(
  overrides: Partial<MarkovdMigrationBlobDescriptor> = {}
): MarkovdMigrationBlobDescriptor {
  return {
    blobKind: 'shell-history',
    key: `${HASH}-zsh`,
    sha256: DIGEST,
    byteLength: 10,
    ...overrides
  }
}

const manifest: MarkovdMigrationManifest = {
  version: MARKOVD_MIGRATION_MANIFEST_VERSION,
  migrationId: 'migration-1',
  manifestSha256: 'c'.repeat(64),
  createdAt: '2026-08-30T12:00:00.000Z',
  source: { sshTargetId: 'ssh-prod', sshTargetGeneration: 7, targetLabel: 'Production' },
  payload: { repositories: [], projectGroups: [], folderWorkspaces: [] }
}

describe('markovd migration blob contract', () => {
  it.each([
    ['terminal-restore-hints', 'migration', true],
    ['terminal-restore-hints', HASH, false],
    ['shell-history', `${HASH}-bash`, true],
    ['shell-history', `${HASH}-fish`, true],
    ['shell-history', `${HASH}-pwsh`, false],
    ['shell-history', `${'A'.repeat(16)}-zsh`, false],
    ['shell-history', `${HASH}.zsh`, false],
    ['agent-session-records', '0f8e2c1a-7b3d-4e5f-9a0b-1c2d3e4f5a6b', true],
    ['agent-session-records', 'Session-Mixed-Case', false],
    ['agent-session-records', '../escape', false],
    ['agent-session-records', 'a.b', false],
    ['agent-session-records', 'x'.repeat(129), false],
    // Windows device names: one with any extension is the device too.
    ['agent-session-records', 'con', false],
    ['agent-session-records', 'prn', false],
    ['agent-session-records', 'aux', false],
    ['agent-session-records', 'nul', false],
    ['agent-session-records', 'com0', false],
    ['agent-session-records', 'com9', false],
    ['agent-session-records', 'lpt1', false],
    ['agent-session-records', 'console', true],
    ['agent-session-records', 'com10', true],
    ['agent-session-records', 'nul-1', true]
  ] as const)('%s key %s valid=%s', (blobKind, key, valid) => {
    const parse = () => parseMarkovdMigrationBlobDescriptor(blob({ blobKind, key }))
    if (valid) {
      expect(parse().key).toBe(key)
    } else {
      expect(parse).toThrow('markovd_migration_blob_key_invalid')
    }
  })

  it('enforces per-kind byte caps, a non-empty body, and the set caps', () => {
    const cap = MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS['terminal-restore-hints'].maxBytes
    const hints = blob({ blobKind: 'terminal-restore-hints', key: 'migration' })
    expect(parseMarkovdMigrationBlobDescriptor({ ...hints, byteLength: cap }).byteLength).toBe(cap)
    expect(() => parseMarkovdMigrationBlobDescriptor({ ...hints, byteLength: cap + 1 })).toThrow(
      'markovd_migration_blob_too_large'
    )
    expect(() => parseMarkovdMigrationBlobDescriptor(blob({ byteLength: 0 }))).toThrow()
    expect(() => assertMarkovdMigrationBlobSet([blob(), blob({ sha256: 'd'.repeat(64) })])).toThrow(
      'markovd_migration_blob_duplicate'
    )
    const big = MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].maxBytes
    const many = Array.from({ length: MAX_MARKOVD_MIGRATION_BLOB_TOTAL_BYTES / big + 1 }, (_, i) =>
      blob({ key: `${i.toString(16).padStart(16, '0')}-zsh`, byteLength: big })
    )
    expect(() => assertMarkovdMigrationBlobSet(many)).toThrow('markovd_migration_blobs_too_large')
  })

  it('requires the channel plus each sent kind, and names the first missing kind', () => {
    const hints = blob({ blobKind: 'terminal-restore-hints', key: 'migration' })
    expect(requiredMigrationBlobCapabilities([])).toEqual([])
    expect(requiredMigrationBlobCapabilities([blob(), hints, blob()])).toEqual([
      MARKOVD_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
      'markovd.migration-blob.terminal-restore-hints.v1',
      'markovd.migration-blob.shell-history.v1'
    ])
    const all = requiredMigrationBlobCapabilities([blob(), hints])
    expect(findUnsupportedMigrationBlobKind([blob(), hints], all)).toBeNull()
    expect(
      findUnsupportedMigrationBlobKind(
        [blob(), hints],
        all.filter((entry) => entry !== MARKOVD_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY)
      )
    ).toBe('shell-history')
    expect(
      findUnsupportedMigrationBlobKind(
        [blob(), hints],
        [
          MARKOVD_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
          'markovd.migration-blob.shell-history.v1'
        ]
      )
    ).toBe('terminal-restore-hints')
    expect(markovdMigrationBlobKindUnsupportedBlocker('shell-history')).toMatch(
      /^markovd_migration_destination_blob_kind_unsupported:shell-history:/
    )
  })

  // Drafts stay on each desktop; a chunk from a build that once shed them is refused, not stored.
  it('refuses the retired editor-drafts kind', () => {
    expect(
      MarkovdMigrationBlobDescriptorSchema.safeParse({
        blobKind: 'editor-drafts',
        key: 'drafts',
        sha256: 'b'.repeat(64),
        byteLength: 4
      }).success
    ).toBe(false)
  })

  it('keeps unknown request fields out and checks the acknowledged length', () => {
    const request = MarkovdMigrationBlobChunkRequestSchema.parse({
      migrationId: manifest.migrationId,
      manifestSha256: manifest.manifestSha256,
      blob: blob(),
      offset: 4,
      bytesBase64: 'YWJj',
      futureField: true
    })
    expect(request).not.toHaveProperty('futureField')
    const result = {
      migrationId: manifest.migrationId,
      manifestSha256: manifest.manifestSha256,
      blobKind: 'shell-history',
      key: `${HASH}-zsh`,
      receivedBytes: 7
    }
    expect(parseMarkovdMigrationBlobChunkResult(result, request).receivedBytes).toBe(7)
    expect(() =>
      parseMarkovdMigrationBlobChunkResult({ ...result, receivedBytes: 6 }, request)
    ).toThrow('markovd_migration_blob_chunk_result_invalid')
  })

  it('parses upload states strictly and treats an absent list as nothing staged', () => {
    expect(parseMarkovdMigrationBlobUploadStates(undefined)).toBeUndefined()
    expect(parseMarkovdMigrationBlobUploadStates([{ ...blob(), receivedBytes: 3 }])).toEqual([
      { ...blob(), receivedBytes: 3 }
    ])
    expect(() => parseMarkovdMigrationBlobUploadStates([{ ...blob(), receivedBytes: 11 }])).toThrow(
      'markovd_migration_blob_state_invalid'
    )
    expect(() => parseMarkovdMigrationBlobUploadStates({})).toThrow(
      'markovd_migration_blob_state_invalid'
    )
  })
})

describe('markovd migration catalog state with blob uploads', () => {
  const staged = {
    state: 'staged',
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256,
    stagedAt: '2026-08-30T12:01:00.000Z'
  }

  it('still accepts a staged state from a host that predates blobs', () => {
    expect(parseMarkovdMigrationCatalogState(staged, manifest)).toEqual(staged)
  })

  it('carries blob uploads from a host that has them', () => {
    const uploads = [{ ...blob(), receivedBytes: 10 }]
    expect(
      parseMarkovdMigrationCatalogState({ ...staged, blobUploads: uploads }, manifest)
    ).toEqual({
      ...staged,
      blobUploads: uploads
    })
    expect(() =>
      parseMarkovdMigrationCatalogState(
        { ...staged, blobUploads: [{ ...blob({ key: 'bad' }), receivedBytes: 0 }] },
        manifest
      )
    ).toThrow('markovd_migration_blob_key_invalid')
  })
})

describe('advertised migration blob kinds', () => {
  it('advertises only the kinds this host installs, terminal history only on a WSL host', () => {
    expect(advertisedMarkovdMigrationBlobCapabilities({ wslHost: false })).toEqual([
      MARKOVD_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
      'markovd.migration-blob.terminal-restore-hints.v1',
      'markovd.migration-blob.shell-history.v1',
      'markovd.migration-blob.automation-run-history.v1'
    ])
    expect(advertisedMarkovdMigrationBlobCapabilities({ wslHost: true })).toEqual([
      MARKOVD_MIGRATION_BLOB_CHANNEL_RUNTIME_CAPABILITY,
      'markovd.migration-blob.terminal-restore-hints.v1',
      'markovd.migration-blob.shell-history.v1',
      'markovd.migration-blob.terminal-history.v1',
      'markovd.migration-blob.automation-run-history.v1'
    ])
  })
})
