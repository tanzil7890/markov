// The manifest omits blobs; descriptor filenames make staged uploads resumable after restart.
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  MARKOVD_MIGRATION_BLOB_KINDS,
  assertMarkovdMigrationBlobSet,
  decodeMarkovdMigrationBlobChunk,
  markovdMigrationBlobIdentity,
  parseMarkovdMigrationBlobDescriptor,
  sameMarkovdMigrationBlob,
  type MarkovdMigrationBlobChunkRequest,
  type MarkovdMigrationBlobChunkResult,
  type MarkovdMigrationBlobDescriptor,
  type MarkovdMigrationBlobKind,
  type MarkovdMigrationBlobUploadState
} from '../../../shared/markovd-migration/markovd-migration-blob-transfer'
import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { syncDirectoryDurablySync } from '../../filesystem/durable-file-write'
import {
  appendMarkovdMigrationStagedChunk,
  ensureMarkovdMigrationDirectory,
  inspectMarkovdMigrationFinalFile,
  linkMarkovdMigrationStagedFile,
  markovdMigrationFileMatches,
  markovdMigrationStagedFileSize,
  markovdMigrationStagingDirectory,
  markovdMigrationStagingKey,
  pruneMarkovdMigrationKeyedDirectories,
  pruneMarkovdMigrationStagingDirectories,
  removeMarkovdMigrationStagingDirectory,
  requireStagedMarkovdMigrationManifest,
  type MarkovdMigrationRequestIdentity
} from './markovd-migration-staged-file'

const RECEIVED_DIRECTORY = 'received'
const STAGED_BLOB_NAME = /^([^.]+)\.([a-f0-9]{64})\.([1-9][0-9]*)\.part$/

type MarkovdMigrationBlobName = Pick<MarkovdMigrationBlobDescriptor, 'blobKind' | 'key'>

type ReceivedBlobPathResolver = (
  root: string,
  manifest: MarkovdMigrationRequestIdentity,
  descriptor: MarkovdMigrationBlobName
) => string

const receivedDirectoryPath: ReceivedBlobPathResolver = (root, manifest, descriptor) =>
  join(receivedBlobsDirectory(root, manifest), descriptor.blobKind, descriptor.key)

const RECEIVED_BLOB_DESTINATIONS: Record<MarkovdMigrationBlobKind, ReceivedBlobPathResolver> = {
  'terminal-restore-hints': receivedDirectoryPath,
  'shell-history': receivedDirectoryPath,
  'agent-session-records': receivedDirectoryPath,
  'terminal-history': receivedDirectoryPath,
  'automation-run-history': receivedDirectoryPath
}

export function getMarkovdMigrationReceivedBlobPath(
  root: string,
  manifest: MarkovdMigrationRequestIdentity,
  descriptor: MarkovdMigrationBlobName
): string {
  return RECEIVED_BLOB_DESTINATIONS[descriptor.blobKind](root, manifest, descriptor)
}

export function listMarkovdMigrationReceivedBlobNames(
  root: string,
  manifest: MarkovdMigrationRequestIdentity,
  blobKind: MarkovdMigrationBlobKind
): string[] {
  return readDirectory(join(receivedBlobsDirectory(root, manifest), blobKind))
}

export type MarkovdMigrationBlobChunkStaging = {
  stagedManifest: MarkovdMigrationManifest | null
  root: string
  request: MarkovdMigrationBlobChunkRequest
}

export function stageMarkovdMigrationBlobChunk(
  args: MarkovdMigrationBlobChunkStaging
): MarkovdMigrationBlobChunkResult {
  const manifest = requireStagedMarkovdMigrationManifest(
    args.stagedManifest,
    args.request,
    'markovd_migration_blob_catalog_not_staged'
  )
  const descriptor = parseMarkovdMigrationBlobDescriptor(args.request.blob)
  const bytes = decodeMarkovdMigrationBlobChunk(args.request.bytesBase64)
  const staged = stagedBlobDescriptors(args.root, manifest)
  const existing = staged.find(
    (entry) => markovdMigrationBlobIdentity(entry) === markovdMigrationBlobIdentity(descriptor)
  )
  if (existing && !sameMarkovdMigrationBlob(existing, descriptor)) {
    // Replacing staged bytes requires abort and restage.
    throw new Error(`markovd_migration_blob_descriptor_conflict:${descriptor.blobKind}`)
  }
  if (!existing) {
    assertMarkovdMigrationBlobSet([...staged, descriptor])
  }
  const path = stagedBlobPath(args.root, manifest, descriptor)
  ensureMarkovdMigrationDirectory(dirname(path))
  const receivedBytes = appendMarkovdMigrationStagedChunk({
    channel: 'blob',
    path,
    offset: args.request.offset,
    bytes,
    byteLength: descriptor.byteLength
  })
  return {
    migrationId: args.request.migrationId,
    manifestSha256: args.request.manifestSha256,
    blobKind: descriptor.blobKind,
    key: descriptor.key,
    receivedBytes
  }
}

export function inspectMarkovdMigrationBlobUploads(
  manifest: MarkovdMigrationManifest,
  root: string
): MarkovdMigrationBlobUploadState[] | undefined {
  const uploads = stagedBlobDescriptors(root, manifest).map((descriptor) => ({
    ...descriptor,
    receivedBytes:
      inspectReceivedBlob(root, manifest, descriptor) === 'matching'
        ? descriptor.byteLength
        : markovdMigrationStagedFileSize(
            stagedBlobPath(root, manifest, descriptor),
            descriptor.byteLength
          )
  }))
  return uploads.length > 0 ? uploads : undefined
}

export function assertMarkovdMigrationBlobsReady(
  manifest: MarkovdMigrationManifest,
  root: string
): void {
  for (const upload of inspectMarkovdMigrationBlobUploads(manifest, root) ?? []) {
    const label = `${upload.blobKind}:${upload.key}`
    const finalStatus = inspectReceivedBlob(root, manifest, upload)
    if (finalStatus === 'conflict') {
      throw new Error(`markovd_migration_blob_destination_conflict:${label}`)
    }
    if (upload.receivedBytes !== upload.byteLength) {
      throw new Error(`markovd_migration_blob_incomplete:${label}`)
    }
    if (
      finalStatus !== 'matching' &&
      !markovdMigrationFileMatches(stagedBlobPath(root, manifest, upload), upload)
    ) {
      throw new Error(`markovd_migration_blob_digest_mismatch:${label}`)
    }
  }
}

/** Verified staged files; call after assertMarkovdMigrationBlobsReady in the same synchronous turn. */
export function stagedMarkovdMigrationBlobFiles(
  manifest: MarkovdMigrationManifest,
  root: string
): { descriptor: MarkovdMigrationBlobDescriptor; path: string }[] {
  return stagedBlobDescriptors(root, manifest).map((descriptor) => ({
    descriptor,
    path: stagedBlobPath(root, manifest, descriptor)
  }))
}

/** A blob's verified bytes, staged or already moved to received by an earlier commit attempt. */
export function readMarkovdMigrationBlob(
  manifest: MarkovdMigrationManifest,
  root: string,
  descriptor: MarkovdMigrationBlobDescriptor
): Buffer {
  for (const path of [
    stagedBlobPath(root, manifest, descriptor),
    getMarkovdMigrationReceivedBlobPath(root, manifest, descriptor)
  ]) {
    if (markovdMigrationFileMatches(path, descriptor)) {
      return readFileSync(path)
    }
  }
  throw new Error(`markovd_migration_blob_incomplete:${descriptor.blobKind}:${descriptor.key}`)
}

/** Reject missing or extra blobs, including leftovers from another capture. */
export function assertMarkovdMigrationBlobSetMatches(
  manifest: MarkovdMigrationManifest,
  root: string,
  expected: readonly MarkovdMigrationBlobDescriptor[]
): void {
  assertMarkovdMigrationBlobSet(expected)
  const wanted = new Map(expected.map((entry) => [markovdMigrationBlobIdentity(entry), entry]))
  const staged = stagedBlobDescriptors(root, manifest)
  const stagedIds = new Set(staged.map(markovdMigrationBlobIdentity))
  for (const descriptor of staged) {
    const match = wanted.get(markovdMigrationBlobIdentity(descriptor))
    if (!match || !sameMarkovdMigrationBlob(match, descriptor)) {
      throw blobSetMismatch(descriptor)
    }
  }
  for (const identity of receivedBlobIdentities(root, manifest)) {
    if (!wanted.has(identity)) {
      throw new Error('markovd_migration_blob_set_mismatch')
    }
  }
  for (const descriptor of expected) {
    // Previous commit attempts may have moved these bytes to received.
    if (
      !stagedIds.has(markovdMigrationBlobIdentity(descriptor)) &&
      inspectReceivedBlob(root, manifest, descriptor) !== 'matching'
    ) {
      throw blobSetMismatch(descriptor)
    }
  }
}

/** Call assertMarkovdMigrationBlobsReady in the same synchronous turn so no chunk can change verified bytes. */
export function commitMarkovdMigrationBlobs(
  manifest: MarkovdMigrationManifest,
  root: string
): void {
  const directories = new Set<string>()
  for (const descriptor of stagedBlobDescriptors(root, manifest)) {
    const finalPath = getMarkovdMigrationReceivedBlobPath(root, manifest, descriptor)
    ensureMarkovdMigrationDirectory(dirname(finalPath))
    linkMarkovdMigrationStagedFile({
      stagedPath: stagedBlobPath(root, manifest, descriptor),
      finalPath,
      expected: descriptor,
      conflictError: `markovd_migration_blob_destination_conflict:${descriptor.blobKind}:${descriptor.key}`
    })
    directories.add(dirname(finalPath))
  }
  for (const directory of directories) {
    syncDirectoryDurablySync(directory)
  }
  removeMarkovdMigrationStagingDirectory(root, manifest)
}

/** Also remove blobs moved by a commit that never landed. */
export function abortMarkovdMigrationBlobs(manifest: MarkovdMigrationManifest, root: string): void {
  removeMarkovdMigrationStagingDirectory(root, manifest)
  rmSync(receivedBlobsDirectory(root, manifest), { recursive: true, force: true })
}

export function pruneMarkovdMigrationBlobStaging(
  stagedManifests: readonly MarkovdMigrationManifest[],
  committedMigrations: readonly MarkovdMigrationRequestIdentity[],
  root: string
): void {
  pruneMarkovdMigrationStagingDirectories(root, stagedManifests)
  pruneMarkovdMigrationKeyedDirectories(join(root, RECEIVED_DIRECTORY), [
    ...stagedManifests,
    ...committedMigrations
  ])
}

function blobSetMismatch(descriptor: MarkovdMigrationBlobDescriptor): Error {
  return new Error(`markovd_migration_blob_set_mismatch:${descriptor.blobKind}:${descriptor.key}`)
}

function receivedBlobIdentities(root: string, manifest: MarkovdMigrationManifest): string[] {
  const received = receivedBlobsDirectory(root, manifest)
  return MARKOVD_MIGRATION_BLOB_KINDS.flatMap((blobKind) =>
    readDirectory(join(received, blobKind)).map((key) =>
      markovdMigrationBlobIdentity({ blobKind, key })
    )
  )
}

function stagedBlobDescriptors(
  root: string,
  manifest: MarkovdMigrationManifest
): MarkovdMigrationBlobDescriptor[] {
  const staging = markovdMigrationStagingDirectory(root, manifest)
  const descriptors: MarkovdMigrationBlobDescriptor[] = []
  for (const blobKind of MARKOVD_MIGRATION_BLOB_KINDS) {
    for (const name of readDirectory(join(staging, blobKind))) {
      const match = STAGED_BLOB_NAME.exec(name)
      if (!match) {
        continue
      }
      try {
        descriptors.push(
          parseMarkovdMigrationBlobDescriptor({
            blobKind,
            key: match[1],
            sha256: match[2],
            byteLength: Number(match[3])
          })
        )
      } catch {
        // Foreign names cannot belong to the staged set.
      }
    }
  }
  return descriptors
}

function readDirectory(path: string): string[] {
  try {
    return readdirSync(path).sort()
  } catch {
    return []
  }
}

function inspectReceivedBlob(
  root: string,
  manifest: MarkovdMigrationManifest,
  descriptor: MarkovdMigrationBlobDescriptor
): 'absent' | 'matching' | 'conflict' {
  return inspectMarkovdMigrationFinalFile(
    getMarkovdMigrationReceivedBlobPath(root, manifest, descriptor),
    descriptor
  )
}

function receivedBlobsDirectory(root: string, manifest: MarkovdMigrationRequestIdentity): string {
  return join(root, RECEIVED_DIRECTORY, markovdMigrationStagingKey(manifest))
}

function stagedBlobPath(
  root: string,
  manifest: MarkovdMigrationManifest,
  descriptor: MarkovdMigrationBlobDescriptor
): string {
  return join(
    markovdMigrationStagingDirectory(root, manifest),
    descriptor.blobKind,
    `${descriptor.key}.${descriptor.sha256}.${descriptor.byteLength}.part`
  )
}
