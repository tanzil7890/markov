import { vi, type Mock } from 'vitest'
import type {
  MarkovdMigrationCatalogState,
  MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'
import { parseMarkovdMigrationManifest } from '../../shared/markovd-migration/markovd-migration-manifest-validation'
import { advertisedMarkovdMigrationDestinationCapabilities } from '../markovd/markovd-migration-destination-capabilities'
import { assertMarkovdMigrationManifestDigest } from '../markovd/markovd-migration-manifest-digest'
import type { Store } from '../persistence/loading-store/store'
import type { MarkovdMigrationDestinationCatalog } from './markovd-migration-cutover-coordinator'

type Catalog = MarkovdMigrationDestinationCatalog

export type FakeMarkovdMigrationDestination = { commits: number } & {
  [Method in keyof Catalog]: Mock<Catalog[Method]>
}

/** Model idempotent stage and receipt-keyed commit with separate catalog state for each migration, including later deltas. */
export function fakeMarkovdMigrationDestination(): FakeMarkovdMigrationDestination {
  const states = new Map<string, 'absent' | 'staged' | 'committed'>()
  const stateOf = (manifest: Pick<MarkovdMigrationManifest, 'migrationId'>) =>
    states.get(manifest.migrationId) ?? 'absent'
  const view = (manifest: MarkovdMigrationManifest): MarkovdMigrationCatalogState => {
    const state = stateOf(manifest)
    const base = { migrationId: manifest.migrationId, manifestSha256: manifest.manifestSha256 }
    if (state === 'committed') {
      return {
        ...base,
        state,
        receipt: {
          version: 1,
          migrationId: manifest.migrationId,
          manifestSha256: manifest.manifestSha256,
          source: manifest.source,
          importedAt: '2026-10-01T00:00:00.000Z',
          repositoryIds: [],
          projectGroupIds: [],
          folderWorkspaceIds: []
        }
      }
    }
    return state === 'staged'
      ? { ...base, state, stagedAt: '2026-10-01T00:00:00.000Z', snapshotUploads: [] }
      : { ...base, state }
  }
  const destination: FakeMarkovdMigrationDestination = {
    commits: 0,
    readState: vi.fn<Catalog['readState']>(async (manifest: MarkovdMigrationManifest) =>
      view(manifest)
    ),
    stage: vi.fn<Catalog['stage']>(async (manifest: MarkovdMigrationManifest) => {
      if (stateOf(manifest) === 'absent') {
        states.set(manifest.migrationId, 'staged')
      }
      return view(manifest)
    }),
    commit: vi.fn<Catalog['commit']>(async (manifest: MarkovdMigrationManifest) => {
      if (stateOf(manifest) === 'staged') {
        states.set(manifest.migrationId, 'committed')
        destination.commits += 1
      }
      return view(manifest)
    }),
    abort: vi.fn<Catalog['abort']>(async (manifest: MarkovdMigrationManifest) => {
      const aborted = stateOf(manifest) === 'staged'
      if (aborted) {
        states.set(manifest.migrationId, 'absent')
      }
      return { ...view(manifest), aborted, ...(aborted ? {} : { durableAbsent: true as const }) }
    }),
    abortByReference: vi.fn<Catalog['abortByReference']>(async (manifest) => {
      const identity = {
        migrationId: manifest.migrationId,
        manifestSha256: manifest.manifestSha256
      }
      if (stateOf(manifest) === 'committed') {
        return { ...identity, state: 'committed', aborted: false }
      }
      const aborted = stateOf(manifest) === 'staged'
      states.delete(manifest.migrationId)
      return { ...identity, state: 'absent', aborted, durableAbsent: true }
    }),
    stageChunk: vi.fn<Catalog['stageChunk']>(),
    readCapabilities: vi.fn<Catalog['readCapabilities']>(async () => []),
    stageBlobChunk: vi.fn<Catalog['stageBlobChunk']>()
  }
  return destination
}

/** A host server's real import, behind manifests sent as the RPC handler receives them. */
export function storeBackedMarkovdMigrationDestination(server: Store): Catalog {
  const sent = (manifest: MarkovdMigrationManifest): MarkovdMigrationManifest => {
    const raw = JSON.parse(JSON.stringify(manifest))
    assertMarkovdMigrationManifestDigest(raw)
    return parseMarkovdMigrationManifest(raw)
  }
  return {
    readState: async (manifest) => server.getMarkovdMigrationCatalogState(sent(manifest)),
    stage: async (manifest) => server.stageMarkovdMigrationCatalog(sent(manifest)),
    commit: async (manifest) => server.commitStagedMarkovdMigrationCatalog(sent(manifest)),
    abort: async (manifest) => {
      const result = server.abortStagedMarkovdMigrationCatalog(sent(manifest))
      return result.aborted ? result : { ...result, durableAbsent: true as const }
    },
    abortByReference: async (reference) =>
      server.abortStagedMarkovdMigrationCatalogByReference(reference),
    stageChunk: async (request) => server.stageMarkovdMigrationSnapshotChunk(request),
    readCapabilities: async () => advertisedMarkovdMigrationDestinationCapabilities(),
    stageBlobChunk: async (request) => server.stageMarkovdMigrationBlobChunk(request)
  }
}
