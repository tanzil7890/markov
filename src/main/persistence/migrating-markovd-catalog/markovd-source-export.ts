// Export copies of relay-hosted SSH state without mutating source rows.
import {
  MARKOVD_MIGRATION_SCROLLBACK_CHUNK_BYTES,
  type MarkovdMigrationTerminalScrollbackSnapshot
} from '../../../shared/markovd-migration/markovd-migration-scrollback'
import type {
  MarkovdMigrationCatalogPayload,
  MarkovdMigrationDormantStatePayload,
  MarkovdMigrationManifest,
  MarkovdMigrationManifestSource
} from '../../../shared/markovd-migration/markovd-migration-manifest'
import { assertMarkovdMigrationManifestDigest } from '../../markovd/markovd-migration-manifest-digest'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import {
  collectMarkovdMigrationUntransferredDependencyCensus,
  type MarkovdMigrationSourceDependencyCensus
} from './markovd-source-dependency-census'
import {
  collectMarkovdMigrationSourceDormantState,
  type MarkovdMigrationSourceDormantInspection
} from './markovd-source-dormant-state'
import { readMarkovdMigrationSourceScrollbackChunk } from './markovd-source-scrollback-state'
import {
  createMarkovdMigrationDeltaView,
  type MarkovdMigrationDeltaView
} from './markovd-source-delta-view'
import { syncMarkovdMigrationScrollbackRetention } from './markovd-source-scrollback-retention'
import { createMarkovdMigrationLeaveBehindView } from './markovd-source-leave-behind-view'
import {
  collectMarkovdMigrationSourceDrafts,
  type MarkovdMigrationSourceDrafts
} from './markovd-source-draft-rename'

type MarkovdSourceExportRuntime = Pick<
  StoreRuntimeState,
  'state' | 'terminalScrollbackSnapshotStorage' | 'retainedScrollbackRefsByMigrationId'
>

const markovdSourceExportContext = Symbol('MarkovdSourceExportPersistence')

export class MarkovdSourceExportPersistence {
  readonly [markovdSourceExportContext]: MarkovdSourceExportRuntime

  constructor(runtime: MarkovdSourceExportRuntime) {
    this[markovdSourceExportContext] = runtime
  }

  collectMarkovdMigrationSourceDormantState(
    source: MarkovdMigrationManifestSource,
    catalog: MarkovdMigrationCatalogPayload,
    destinationEnvironmentId?: string
  ): MarkovdMigrationDormantStatePayload {
    const runtime = this[markovdSourceExportContext]
    return collectMarkovdMigrationSourceDormantState(
      runtime.state,
      source,
      catalog,
      runtime.terminalScrollbackSnapshotStorage,
      destinationEnvironmentId
    ).payload
  }

  /** The export plus what it could not carry, for a move that must refuse rather than drop rows. */
  inspectMarkovdMigrationSourceDormantState(
    source: MarkovdMigrationManifestSource,
    catalog: MarkovdMigrationCatalogPayload,
    destinationEnvironmentId?: string,
    daemonHistoryLeaf?: (tabId: string, leafId: string) => boolean
  ): MarkovdMigrationSourceDormantInspection {
    const runtime = this[markovdSourceExportContext]
    return collectMarkovdMigrationSourceDormantState(
      runtime.state,
      source,
      catalog,
      runtime.terminalScrollbackSnapshotStorage,
      destinationEnvironmentId,
      daemonHistoryLeaf
    )
  }

  collectMarkovdMigrationSourceDrafts(
    manifest: MarkovdMigrationManifest
  ): MarkovdMigrationSourceDrafts {
    return collectMarkovdMigrationSourceDrafts(this[markovdSourceExportContext].state, manifest)
  }

  createMarkovdMigrationDeltaView(moved: MarkovdMigrationManifest): MarkovdMigrationDeltaView {
    return createMarkovdMigrationDeltaView(this[markovdSourceExportContext], moved)
  }

  /** Preview "Move anyway" without recording consent. */
  createMarkovdMigrationLeaveBehindView(targetId: string): MarkovdMigrationDeltaView {
    return createMarkovdMigrationLeaveBehindView(this[markovdSourceExportContext], targetId)
  }

  inspectMarkovdMigrationUntransferredDependencies(
    manifest: MarkovdMigrationManifest
  ): MarkovdMigrationSourceDependencyCensus {
    const runtime = this[markovdSourceExportContext]
    return collectMarkovdMigrationUntransferredDependencyCensus(
      runtime.state,
      manifest,
      runtime.terminalScrollbackSnapshotStorage
    )
  }

  /** Retain unfinished migrations' snapshots even if their tabs close. */
  syncMarkovdMigrationScrollbackRetention(pending: readonly MarkovdMigrationManifest[]): void {
    syncMarkovdMigrationScrollbackRetention(this[markovdSourceExportContext], pending)
  }

  /** Verify snapshot bytes against the signed manifest so changed buffers cannot be transferred. */
  readMarkovdMigrationSourceSnapshotChunk(
    manifest: MarkovdMigrationManifest,
    ref: string,
    offset: number
  ): { bytesBase64: string; totalBytes: number; eof: boolean } {
    assertMarkovdMigrationManifestDigest(manifest)
    const descriptor: MarkovdMigrationTerminalScrollbackSnapshot | undefined =
      manifest.payload.dormantState?.terminalScrollbackSnapshots?.find((entry) => entry.ref === ref)
    if (!descriptor) {
      throw new Error('markovd_migration_source_snapshot_unknown')
    }
    const runtime = this[markovdSourceExportContext]
    return readMarkovdMigrationSourceScrollbackChunk({
      state: runtime.state,
      descriptor,
      retained: [...runtime.retainedScrollbackRefsByMigrationId.values()].some((refs) =>
        refs.has(ref)
      ),
      offset,
      length: MARKOVD_MIGRATION_SCROLLBACK_CHUNK_BYTES,
      storage: runtime.terminalScrollbackSnapshotStorage
    })
  }
}
