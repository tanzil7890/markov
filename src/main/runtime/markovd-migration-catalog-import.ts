import type {
  MarkovdMigrationCatalogAbortResult,
  MarkovdMigrationCatalogReference,
  MarkovdMigrationCatalogReferenceAbortResult,
  MarkovdMigrationCatalogState,
  MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'
import type { MarkovdMigrationBlobDescriptor } from '../../shared/markovd-migration/markovd-migration-blob-transfer'
import type { Store } from '../persistence/loading-store/store'

/** A moved history waits while a shell runs in its worktree: that shell would overwrite it. */
type WorktreeHasLiveShells = (worktreeId: string) => boolean

type MarkovdMigrationCatalogFlushStore = Partial<Pick<Store, 'flushPendingOrThrowAsync'>>
type MarkovdMigrationCatalogStageStore = MarkovdMigrationCatalogFlushStore &
  Partial<Pick<Store, 'stageMarkovdMigrationCatalog'>>
type MarkovdMigrationCatalogCommitStore = MarkovdMigrationCatalogFlushStore &
  Partial<
    Pick<Store, 'commitStagedMarkovdMigrationCatalog' | 'installMarkovdMigrationReceivedBlobs'>
  >
type MarkovdMigrationCatalogAbortStore = MarkovdMigrationCatalogFlushStore &
  Partial<Pick<Store, 'abortStagedMarkovdMigrationCatalog'>>
type MarkovdMigrationCatalogAbortByReferenceStore = MarkovdMigrationCatalogFlushStore &
  Partial<Pick<Store, 'abortStagedMarkovdMigrationCatalogByReference'>>

export async function stageMarkovdMigrationCatalogDurably(args: {
  store: MarkovdMigrationCatalogStageStore
  manifest: MarkovdMigrationManifest
  signal?: AbortSignal
}): Promise<MarkovdMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.stageMarkovdMigrationCatalog!(args.manifest)
  await flushMigrationState(args.store, args.signal)
  return result
}

export async function commitStagedMarkovdMigrationCatalogDurably(args: {
  store: MarkovdMigrationCatalogCommitStore
  manifest: MarkovdMigrationManifest
  signal?: AbortSignal
  expectedBlobs?: readonly MarkovdMigrationBlobDescriptor[]
  onDurableCommit: () => void
  worktreeHasLiveShells?: WorktreeHasLiveShells
}): Promise<MarkovdMigrationCatalogState> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.commitStagedMarkovdMigrationCatalog!(
    args.manifest,
    args.expectedBlobs ? { expectedBlobs: args.expectedBlobs } : {}
  )
  await flushMigrationState(args.store, args.signal)
  args.onDurableCommit()
  installReceivedBlobs(args.store, args.manifest, args.worktreeHasLiveShells)
  return result
}

/** After the durable commit, on its retries and state queries; the store load retries too. */
function installReceivedBlobs(
  store: Partial<Pick<Store, 'installMarkovdMigrationReceivedBlobs'>>,
  manifest: MarkovdMigrationManifest,
  worktreeHasLiveShells: WorktreeHasLiveShells | undefined
): void {
  try {
    store.installMarkovdMigrationReceivedBlobs?.(manifest, { worktreeHasLiveShells })
  } catch (error) {
    // The catalog is committed; a failed install keeps its blob for the next retry.
    console.error('[markovd-migration] installing received blobs failed:', error)
  }
}

export async function abortStagedMarkovdMigrationCatalogDurably(args: {
  store: MarkovdMigrationCatalogAbortStore
  manifest: MarkovdMigrationManifest
  signal?: AbortSignal
}): Promise<MarkovdMigrationCatalogAbortResult> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.abortStagedMarkovdMigrationCatalog!(args.manifest)
  // An already-absent retry may follow an in-memory abort whose flush failed.
  if (result.state === 'absent') {
    await flushMigrationState(args.store, args.signal)
    return { ...result, durableAbsent: true }
  }
  return result
}

export async function abortStagedMarkovdMigrationCatalogByReferenceDurably(args: {
  store: MarkovdMigrationCatalogAbortByReferenceStore
  reference: MarkovdMigrationCatalogReference
  signal?: AbortSignal
}): Promise<MarkovdMigrationCatalogReferenceAbortResult> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.abortStagedMarkovdMigrationCatalogByReference!(args.reference)
  await flushMigrationState(args.store, args.signal)
  // Either answer is flushed first, so a source that cannot re-send the manifest may act on it.
  return result.state === 'absent'
    ? { ...result, durableAbsent: true }
    : { ...result, durableCommitted: true }
}

export function getMarkovdMigrationCatalogState(args: {
  store: Partial<
    Pick<Store, 'getMarkovdMigrationCatalogState' | 'installMarkovdMigrationReceivedBlobs'>
  >
  manifest: MarkovdMigrationManifest
  worktreeHasLiveShells?: WorktreeHasLiveShells
}): MarkovdMigrationCatalogState {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  const result = args.store.getMarkovdMigrationCatalogState!(args.manifest)
  if (result.state === 'committed') {
    installReceivedBlobs(args.store, args.manifest, args.worktreeHasLiveShells)
  }
  return result
}

function flushMigrationState(
  store: MarkovdMigrationCatalogFlushStore,
  signal?: AbortSignal
): Promise<void> {
  // SAFETY: Returned or mutable Store slots retain their original native missing-method failure.
  return store.flushPendingOrThrowAsync!({
    signal,
    drainToStableGeneration: false
  })
}
