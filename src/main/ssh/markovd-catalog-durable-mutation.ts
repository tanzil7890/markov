import type { MarkovdMigrationCatalogState } from '../../shared/markovd-migration/markovd-migration-manifest'

export async function resolveDurableMarkovdCatalogMutation(
  mutate: () => Promise<MarkovdMigrationCatalogState>,
  read: () => Promise<MarkovdMigrationCatalogState>,
  accepted: (state: MarkovdMigrationCatalogState) => boolean
) {
  try {
    return await mutate()
  } catch (mutationError) {
    let observed: MarkovdMigrationCatalogState
    try {
      observed = await read()
    } catch {
      throw mutationError
    }
    if (!accepted(observed)) {
      throw mutationError
    }
  }
  // State reads may reflect unflushed mutations; an idempotent acknowledgment proves durability.
  return mutate()
}
