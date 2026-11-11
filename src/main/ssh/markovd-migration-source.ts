/** Expose fenced-source checks/release through the cutover port; conversion owns terminal assessment, export and fence acquisition. */
import type { MarkovdMigrationSourceKind } from '../../shared/markovd-migration/markovd-migration-source-kind'
import type {
  MarkovdMigrationCatalogPayload,
  MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'
import type { MarkovdMigrationSourceCutover } from '../../shared/markovd-migration/markovd-migration-source-cutover'
import type {
  MarkovdMigrationExportedBlob,
  MarkovdMigrationManifestExportOptions
} from './markovd-migration-manifest-export'
import type {
  MarkovdMigrationFenceResult,
  MarkovdMigrationFenceState
} from './markovd-migration-source-fence'
import type { MarkovdMigrationTerminalVerdict } from './markovd-migration-terminal-gate'

export type MarkovdMigrationSourceCutoverPort = {
  /** Before every stage and commit; throws unless the fenced source still matches the journal.
   * Returns the bytes of the blobs its manifest names, which that match proves are the journaled ones. */
  verifyFence: (cutover: MarkovdMigrationSourceCutover) => MarkovdMigrationExportedBlob[]
  /** Drops the fence, then the journal; only on proof the destination holds nothing. */
  releaseFence: (cutover: MarkovdMigrationSourceCutover) => Promise<void>
}

type MarkovdMigrationFenceAcquireArgs = {
  destinationEnvironmentId: string
  destinationName: string
  terminalProof: MarkovdMigrationTerminalVerdict
  now?: () => Date
  signal?: AbortSignal
}

export type MarkovdMigrationSource = MarkovdMigrationSourceCutoverPort & {
  readonly kind: MarkovdMigrationSourceKind
  readonly journalKey: string
  collectCatalog: () => MarkovdMigrationCatalogPayload
  /** Rewrite paths before signing; export must not mutate source. */
  exportManifest: (options?: MarkovdMigrationManifestExportOptions) => MarkovdMigrationManifest
  /** Before the fence. Loss of contact is `unverifiable`, never `exited`. */
  assessTerminals: () => Promise<MarkovdMigrationTerminalVerdict>
  retireProvenExitedTerminals: (proof: MarkovdMigrationTerminalVerdict) => void
  /** Throws when the journal cannot be read: an unreadable record keeps the source fenced. */
  resolveFence: () => MarkovdMigrationFenceState
  /** Journal, then fence, then flush, then the terminal re-check under the fence. */
  acquireFence: (args: MarkovdMigrationFenceAcquireArgs) => Promise<MarkovdMigrationFenceResult>
}
