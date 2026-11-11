import type { PersistedState } from '../../../shared/persisted-state-types'
import type { MarkovdMigrationDormantStatePayload } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { serializeMarkovdMigrationValue } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { canonicalWorktreeIdentity } from '../../../shared/worktree/identity'
import { composeWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { omitDefaultWorktreeMetaFields } from '../../../shared/worktree/meta-persisted-defaults'

export function assertMarkovdDestinationCanonicalMetadata(
  state: PersistedState,
  entries: MarkovdMigrationDormantStatePayload['worktreeMeta']
): void {
  for (const { worktreeId, meta } of entries) {
    const alias = composeWorktreeHostIdentity('local', worktreeId)
    const identities = state.worktreeIdentityAliases?.[alias] ?? []
    const expectedKey = meta.instanceId
      ? canonicalWorktreeIdentity({
          worktreeId,
          executionHostId: 'local',
          instanceId: meta.instanceId
        })
      : undefined
    const candidates = new Set([
      ...identities,
      ...(expectedKey && state.worktreeMetaByIdentity?.[expectedKey] ? [expectedKey] : [])
    ])
    if (
      candidates.size > 1 ||
      [...candidates].some((key) => {
        const current = state.worktreeMetaByIdentity?.[key]
        return (
          !current ||
          key !== expectedKey ||
          serializeMarkovdMigrationValue(omitDefaultWorktreeMetaFields(current)) !==
            serializeMarkovdMigrationValue(omitDefaultWorktreeMetaFields(meta))
        )
      })
    ) {
      throw new Error(`markovd_migration_dormant_id_conflict:worktree_meta:${worktreeId}`)
    }
  }
}
