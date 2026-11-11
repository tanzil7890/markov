import type { PersistedState } from '../../../shared/persisted-state-types'
import type { WorktreeMeta } from '../../../shared/worktree/meta-types'
import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { serializeMarkovdMigrationValue } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { canonicalWorktreeIdentity } from '../../../shared/worktree/identity'
import {
  getExecutionHostIdFromWorktreeHostIdentity,
  isWorktreeHostIdentity
} from '../../../shared/worktree/host-qualified-identity'
import { pruneUnreferencedWorktreeIdentityMeta } from '../loading-store/worktree-identity-metadata'
import {
  createMarkovdMigrationSourceScope,
  markovdMigrationOwnerMatchesScope,
  markovdMigrationScopeOwnsWholeHost,
  unqualifyMarkovdMigrationOwnerKey,
  type MarkovdMigrationSourceScope
} from './markovd-source-scope'

export function inspectMarkovdSourceWorktreeMetadata(
  state: PersistedState,
  scope: MarkovdMigrationSourceScope
) {
  const rows: { sourceKey: string; meta: WorktreeMeta }[] = []
  let blockedCount = 0
  const wholeHost = markovdMigrationScopeOwnsWholeHost(scope)
  for (const [sourceKey, meta] of Object.entries(state.worktreeMeta)) {
    const host = getExecutionHostIdFromWorktreeHostIdentity(sourceKey)
    if ((host && host !== scope.hostId) || (meta.hostId && meta.hostId !== scope.hostId)) {
      if (
        (host === scope.hostId || meta.hostId === scope.hostId) &&
        (wholeHost || markovdMigrationOwnerMatchesScope(sourceKey, scope))
      ) {
        blockedCount++
      }
      continue
    }
    if (markovdMigrationOwnerMatchesScope(sourceKey, scope, meta.hostId)) {
      rows.push({ sourceKey, meta })
    } else if (wholeHost && (meta.hostId === scope.hostId || host === scope.hostId)) {
      blockedCount++
    }
  }
  const referenced = new Set(Object.values(state.worktreeIdentityAliases ?? {}).flat())
  for (const [identity, meta] of Object.entries(state.worktreeMetaByIdentity ?? {})) {
    // An unreferenced identity names no worktree, so only a whole-host move can claim it.
    if (wholeHost && meta.hostId === scope.hostId && !referenced.has(identity)) {
      blockedCount++
    }
  }
  for (const [alias, identities] of Object.entries(state.worktreeIdentityAliases ?? {})) {
    if (getExecutionHostIdFromWorktreeHostIdentity(alias) !== scope.hostId) {
      continue
    }
    if (!wholeHost && !markovdMigrationOwnerMatchesScope(alias, scope)) {
      continue
    }
    if (isDanglingAlias(state, identities) && markovdMigrationOwnerMatchesScope(alias, scope)) {
      continue // Dangling aliases carry no metadata; any legacy row migrates separately.
    }
    const meta = identities.length === 1 ? state.worktreeMetaByIdentity?.[identities[0]] : undefined
    const worktreeId = unqualifyMarkovdMigrationOwnerKey(alias)
    if (
      isWorktreeHostIdentity(worktreeId) ||
      !markovdMigrationOwnerMatchesScope(alias, scope) ||
      !meta ||
      !meta.instanceId ||
      (meta.hostId !== undefined && meta.hostId !== scope.hostId) ||
      identities[0] !==
        canonicalWorktreeIdentity({
          worktreeId,
          executionHostId: scope.hostId,
          instanceId: meta.instanceId
        })
    ) {
      blockedCount++
      continue
    }
    const legacy = rows.filter(
      (row) => unqualifyMarkovdMigrationOwnerKey(row.sourceKey) === worktreeId
    )
    if (
      legacy.length > 1 ||
      (legacy.length === 1 &&
        serializeMarkovdMigrationValue({ ...legacy[0].meta, hostId: scope.hostId }) !==
          serializeMarkovdMigrationValue({ ...meta, hostId: scope.hostId }))
    ) {
      // Neither representation may silently discard data held only by its competing row.
      blockedCount++
      continue
    }
    if (legacy.length === 0) {
      rows.push({ sourceKey: alias, meta: { ...meta, hostId: scope.hostId } })
    }
  }
  return { rows, blockedCount }
}

export function subtractMarkovdSourceWorktreeMetadata(
  state: PersistedState,
  manifest: MarkovdMigrationManifest
) {
  const scope = createMarkovdMigrationSourceScope({
    source: manifest.source,
    catalog: manifest.payload,
    repos: state.repos
  })
  const entries = manifest.payload.dormantState?.worktreeMeta ?? []
  // The server owns moved projects, including rows added later by downgraded builds.
  const added = inspectMarkovdSourceWorktreeMetadata(state, scope).rows.map((row) => row.sourceKey)
  const sourceKeys = new Set([...entries.map((entry) => entry.sourceKey), ...added])
  const worktreeIds = new Set([
    ...entries.map((entry) => entry.worktreeId),
    ...added.map(unqualifyMarkovdMigrationOwnerKey)
  ])
  const removedIdentities = new Set<string>()
  for (const [alias, identities] of Object.entries(state.worktreeIdentityAliases ?? {})) {
    if (
      getExecutionHostIdFromWorktreeHostIdentity(alias) === scope.hostId &&
      (worktreeIds.has(unqualifyMarkovdMigrationOwnerKey(alias)) ||
        (isDanglingAlias(state, identities) && markovdMigrationOwnerMatchesScope(alias, scope)))
    ) {
      identities.forEach((identity) => removedIdentities.add(identity))
      delete state.worktreeIdentityAliases?.[alias]
    }
  }
  sourceKeys.forEach((sourceKey) => delete state.worktreeMeta[sourceKey])
  pruneUnreferencedWorktreeIdentityMeta(state, removedIdentities)
}

function isDanglingAlias(state: PersistedState, identities: readonly string[]): boolean {
  return identities.every((identity) => {
    const meta = state.worktreeMetaByIdentity?.[identity]
    return !meta || Object.keys(meta).length === 0
  })
}
