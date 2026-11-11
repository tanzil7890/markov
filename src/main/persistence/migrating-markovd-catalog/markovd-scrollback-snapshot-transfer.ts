import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import {
  decodeMarkovdMigrationSnapshotChunk,
  type MarkovdMigrationSnapshotChunkRequest,
  type MarkovdMigrationSnapshotChunkResult,
  type MarkovdMigrationSnapshotUploadState,
  type MarkovdMigrationTerminalScrollbackSnapshot
} from '../../../shared/markovd-migration/markovd-migration-scrollback'
import { syncDirectoryDurablySync } from '../../filesystem/durable-file-write'
import {
  getTerminalScrollbackSnapshotPath,
  getTerminalScrollbackSnapshotRoot,
  type TerminalScrollbackSnapshotStorage
} from '../../pty/scrollback/terminal-scrollback-snapshots'
import {
  appendMarkovdMigrationStagedChunk,
  ensureMarkovdMigrationDirectory,
  inspectMarkovdMigrationFinalFile,
  linkMarkovdMigrationStagedFile,
  markovdMigrationFileMatches,
  markovdMigrationStagedFileSize,
  markovdMigrationStagingDirectory,
  pruneMarkovdMigrationStagingDirectories,
  removeMarkovdMigrationStagingDirectory,
  requireStagedMarkovdMigrationManifest
} from './markovd-migration-staged-file'

/** Only the staged manifest's snapshots may receive chunks; retried ranges must match. */
export function stageMarkovdMigrationSnapshotChunk(args: {
  stagedManifest: MarkovdMigrationManifest | null
  storage: TerminalScrollbackSnapshotStorage
  request: MarkovdMigrationSnapshotChunkRequest
}): MarkovdMigrationSnapshotChunkResult {
  const manifest = requireStagedMarkovdMigrationManifest(
    args.stagedManifest,
    args.request,
    'markovd_migration_snapshot_catalog_not_staged'
  )
  const descriptor = requireDescriptor(manifest, args.request.ref)
  const bytes = decodeMarkovdMigrationSnapshotChunk(args.request.bytesBase64)
  ensureMarkovdMigrationDirectory(stagingDirectory(args.storage, manifest))
  const acknowledgedOffset = appendMarkovdMigrationStagedChunk({
    channel: 'snapshot',
    path: stagedSnapshotPath(args.storage, manifest, descriptor),
    offset: args.request.offset,
    bytes,
    byteLength: descriptor.byteLength
  })
  return {
    migrationId: args.request.migrationId,
    manifestSha256: args.request.manifestSha256,
    ref: args.request.ref,
    acknowledgedOffset
  }
}

export function inspectMarkovdMigrationSnapshotUploads(
  manifest: MarkovdMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): MarkovdMigrationSnapshotUploadState[] | undefined {
  const snapshots = manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  if (snapshots.length === 0) {
    return undefined
  }
  return snapshots.map((descriptor) => ({
    ...descriptor,
    receivedBytes:
      inspectFinalSnapshot(storage, descriptor) === 'matching'
        ? descriptor.byteLength
        : markovdMigrationStagedFileSize(
            stagedSnapshotPath(storage, manifest, descriptor),
            descriptor.byteLength
          )
  }))
}

export function assertMarkovdMigrationSnapshotsReady(
  manifest: MarkovdMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  for (const upload of inspectMarkovdMigrationSnapshotUploads(manifest, storage) ?? []) {
    const finalStatus = inspectFinalSnapshot(storage, upload)
    if (finalStatus === 'conflict') {
      throw new Error(`markovd_migration_snapshot_destination_conflict:${upload.ref}`)
    }
    if (upload.receivedBytes !== upload.byteLength) {
      throw new Error(`markovd_migration_snapshot_incomplete:${upload.ref}`)
    }
    const path =
      finalStatus === 'matching'
        ? getTerminalScrollbackSnapshotPath(upload.ref, storage)
        : stagedSnapshotPath(storage, manifest, upload)
    if (!path || !markovdMigrationFileMatches(path, upload)) {
      throw new Error(`markovd_migration_snapshot_digest_mismatch:${upload.ref}`)
    }
  }
}

export function commitMarkovdMigrationSnapshots(
  manifest: MarkovdMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  const snapshots = manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  assertMarkovdMigrationSnapshotsReady(manifest, storage)
  const root = getTerminalScrollbackSnapshotRoot(storage)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  for (const descriptor of snapshots) {
    const finalPath = getTerminalScrollbackSnapshotPath(descriptor.ref, storage)
    if (!finalPath) {
      throw new Error('markovd_migration_snapshot_ref_invalid')
    }
    linkMarkovdMigrationStagedFile({
      stagedPath: stagedSnapshotPath(storage, manifest, descriptor),
      finalPath,
      expected: descriptor,
      conflictError: `markovd_migration_snapshot_destination_conflict:${descriptor.ref}`
    })
  }
  syncDirectoryDurablySync(root)
  removeMarkovdMigrationStagingDirectory(root, manifest)
}

export function abortMarkovdMigrationSnapshots(
  manifest: MarkovdMigrationManifest,
  storage: TerminalScrollbackSnapshotStorage
): void {
  removeMarkovdMigrationStagingDirectory(getTerminalScrollbackSnapshotRoot(storage), manifest)
}

export function pruneMarkovdMigrationSnapshotStaging(
  stagedManifests: readonly MarkovdMigrationManifest[],
  storage: TerminalScrollbackSnapshotStorage
): void {
  pruneMarkovdMigrationStagingDirectories(
    getTerminalScrollbackSnapshotRoot(storage),
    stagedManifests
  )
}

function requireDescriptor(
  manifest: MarkovdMigrationManifest,
  ref: string
): MarkovdMigrationTerminalScrollbackSnapshot {
  const descriptor = manifest.payload.dormantState?.terminalScrollbackSnapshots?.find(
    (entry) => entry.ref === ref
  )
  if (!descriptor) {
    throw new Error('markovd_migration_snapshot_unknown')
  }
  return descriptor
}

function inspectFinalSnapshot(
  storage: TerminalScrollbackSnapshotStorage,
  descriptor: MarkovdMigrationTerminalScrollbackSnapshot
): 'absent' | 'matching' | 'conflict' {
  return inspectMarkovdMigrationFinalFile(
    getTerminalScrollbackSnapshotPath(descriptor.ref, storage),
    descriptor
  )
}

function stagingDirectory(
  storage: TerminalScrollbackSnapshotStorage,
  manifest: MarkovdMigrationManifest
): string {
  return markovdMigrationStagingDirectory(getTerminalScrollbackSnapshotRoot(storage), manifest)
}

function stagedSnapshotPath(
  storage: TerminalScrollbackSnapshotStorage,
  manifest: MarkovdMigrationManifest,
  descriptor: MarkovdMigrationTerminalScrollbackSnapshot
): string {
  return join(stagingDirectory(storage, manifest), `${descriptor.ref}.${descriptor.sha256}.part`)
}
