/** Read snapshot chunks from source storage and verify manifest length/digest. Resume from destination offsets; re-read after lost acknowledgements instead of assuming delivery. This transport-independent driver retires nothing. */
import type {
  MarkovdMigrationCatalogState,
  MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'
import {
  decodeMarkovdMigrationSnapshotChunk,
  type MarkovdMigrationSnapshotChunkRequest,
  type MarkovdMigrationSnapshotChunkResult
} from '../../shared/markovd-migration/markovd-migration-scrollback'
import type { Store } from '../persistence/loading-store/store'

export type MarkovdMigrationSnapshotSource = Pick<Store, 'readMarkovdMigrationSourceSnapshotChunk'>

type MarkovdMigrationSnapshotDestination = {
  readState: (manifest: MarkovdMigrationManifest) => Promise<MarkovdMigrationCatalogState>
  stageChunk: (
    request: MarkovdMigrationSnapshotChunkRequest
  ) => Promise<MarkovdMigrationSnapshotChunkResult>
}

export async function transferMarkovdMigrationSnapshots(args: {
  source: MarkovdMigrationSnapshotSource
  manifest: MarkovdMigrationManifest
  state: Extract<MarkovdMigrationCatalogState, { state: 'staged' }>
  destination: MarkovdMigrationSnapshotDestination
}): Promise<void> {
  const snapshots = args.manifest.payload.dormantState?.terminalScrollbackSnapshots ?? []
  if (snapshots.length === 0) {
    return
  }
  // Journal retention keeps bytes available after tab close, including retries.
  await sendSnapshots(args, snapshots)
}

async function sendSnapshots(
  args: Parameters<typeof transferMarkovdMigrationSnapshots>[0],
  snapshots: NonNullable<
    NonNullable<MarkovdMigrationManifest['payload']['dormantState']>['terminalScrollbackSnapshots']
  >
): Promise<void> {
  const offsets = new Map(
    (args.state.snapshotUploads ?? []).map((entry) => [entry.ref, entry.receivedBytes])
  )
  for (const snapshot of snapshots) {
    let offset = offsets.get(snapshot.ref)
    if (offset === undefined) {
      throw new Error('markovd_migration_snapshot_transfer_unsupported')
    }
    while (offset < snapshot.byteLength) {
      const chunk = args.source.readMarkovdMigrationSourceSnapshotChunk(
        args.manifest,
        snapshot.ref,
        offset
      )
      if (chunk.totalBytes !== snapshot.byteLength || !chunk.bytesBase64) {
        throw new Error('markovd_migration_source_snapshot_changed')
      }
      const request: MarkovdMigrationSnapshotChunkRequest = {
        migrationId: args.manifest.migrationId,
        manifestSha256: args.manifest.manifestSha256,
        ref: snapshot.ref,
        offset,
        bytesBase64: chunk.bytesBase64
      }
      const expectedOffset = offset + decodeMarkovdMigrationSnapshotChunk(chunk.bytesBase64).length
      offset = await stageChunkWithRecovery(args, request, expectedOffset)
    }
  }
  const verified = await args.destination.readState(args.manifest)
  if (
    verified.state !== 'staged' ||
    (verified.snapshotUploads ?? []).length !== snapshots.length ||
    (verified.snapshotUploads ?? []).some((entry) => entry.receivedBytes !== entry.byteLength)
  ) {
    throw new Error('markovd_migration_snapshot_transfer_incomplete')
  }
}

async function stageChunkWithRecovery(
  args: { manifest: MarkovdMigrationManifest; destination: MarkovdMigrationSnapshotDestination },
  request: MarkovdMigrationSnapshotChunkRequest,
  expectedOffset: number
): Promise<number> {
  try {
    const result = await args.destination.stageChunk(request)
    if (result.acknowledgedOffset !== expectedOffset) {
      throw new Error('markovd_migration_snapshot_ack_invalid')
    }
    return result.acknowledgedOffset
  } catch (error) {
    try {
      const observed = await args.destination.readState(args.manifest)
      const received =
        observed.state === 'staged'
          ? observed.snapshotUploads?.find((entry) => entry.ref === request.ref)?.receivedBytes
          : undefined
      if (received === expectedOffset) {
        return received
      }
    } catch {
      // Unverifiable chunks retain the original failure.
    }
    throw error
  }
}
