import type {
  MarkovdMigrationCatalogState,
  MarkovdMigrationImportReceipt,
  MarkovdMigrationManifest
} from '../../../shared/markovd-migration/markovd-migration-manifest'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import {
  assertMarkovdMigrationReceiptMatchesManifest,
  assertSameMarkovdMigrationManifest
} from './markovd-catalog-records'
import { findMarkovdMigrationImportReceipt } from './markovd-catalog-receipt-ledger'
import { inspectMarkovdMigrationSnapshotUploads } from './markovd-scrollback-snapshot-transfer'
import { inspectMarkovdMigrationBlobUploads } from './markovd-migration-blob-staging'

type MarkovdCatalogStateRuntime = Pick<
  StoreRuntimeState,
  'state' | 'terminalScrollbackSnapshotStorage' | 'markovdMigrationBlobRoot'
>

export function migrationCatalogState(
  runtime: MarkovdCatalogStateRuntime,
  manifest: MarkovdMigrationManifest
): MarkovdMigrationCatalogState {
  const { state } = runtime
  const receipt = findMarkovdMigrationImportReceipt(state, manifest)
  if (receipt) {
    assertCommittedReceipt(receipt, manifest)
    return committedCatalogState(receipt)
  }
  const staged = state.markovdMigrationStagedCatalogs?.find(
    (entry) => entry.manifest.migrationId === manifest.migrationId
  )
  if (!staged) {
    return absentCatalogState(manifest)
  }
  assertSameMarkovdMigrationManifest(staged.manifest, manifest)
  return stagedCatalogState(manifest, staged.stagedAt, runtime)
}

// A committed receipt stays authoritative even after live rows and snapshots change.
function assertCommittedReceipt(
  receipt: MarkovdMigrationImportReceipt,
  manifest: MarkovdMigrationManifest
): void {
  if (receipt.manifestSha256 !== manifest.manifestSha256) {
    throw new Error('markovd_migration_id_reused_with_different_manifest')
  }
  assertMarkovdMigrationReceiptMatchesManifest(receipt, manifest)
}

export function absentCatalogState(
  manifest: MarkovdMigrationManifest
): MarkovdMigrationCatalogState {
  return {
    state: 'absent',
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256
  }
}

export function stagedCatalogState(
  manifest: MarkovdMigrationManifest,
  stagedAt: string,
  runtime: MarkovdCatalogStateRuntime
): MarkovdMigrationCatalogState {
  const snapshotUploads = inspectMarkovdMigrationSnapshotUploads(
    manifest,
    runtime.terminalScrollbackSnapshotStorage
  )
  // Omit absent uploads to preserve older hosts' response shape.
  const blobUploads = inspectMarkovdMigrationBlobUploads(manifest, runtime.markovdMigrationBlobRoot)
  return {
    state: 'staged',
    migrationId: manifest.migrationId,
    manifestSha256: manifest.manifestSha256,
    stagedAt,
    ...(snapshotUploads ? { snapshotUploads } : {}),
    ...(blobUploads ? { blobUploads } : {})
  }
}

export function committedCatalogState(
  receipt: MarkovdMigrationImportReceipt
): MarkovdMigrationCatalogState {
  return {
    state: 'committed',
    migrationId: receipt.migrationId,
    manifestSha256: receipt.manifestSha256,
    receipt: structuredClone(receipt)
  }
}
