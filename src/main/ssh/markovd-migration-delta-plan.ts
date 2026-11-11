/** Subtract earlier migrations' currently retained rows/state; export only additions. Never merge overlapping old source copies over server-owned state. */
import type {
  MarkovdDeltaMovePreview,
  MarkovdDeltaMoveRow
} from '../../shared/markovd-managed-runtime'
import type {
  MarkovdMigrationCatalogPayload,
  MarkovdMigrationManifest
} from '../../shared/markovd-migration/markovd-migration-manifest'
import { isRetainedMarkovdMigrationSourceCutover } from '../../shared/markovd-migration/markovd-migration-source-cutover'
import type { MarkovdMigrationSourceCutover } from '../../shared/markovd-migration/markovd-migration-source-cutover'
import type { SshTarget } from '../../shared/ssh-types'
import type { Store } from '../persistence/loading-store/store'
import { collectMarkovdMigrationSourceCatalog } from '../persistence/migrating-markovd-catalog/markovd-source-catalog'
import { listMarkovdMigrationCutoverChainForTarget } from './markovd-migration-cutover-journal'
import {
  createMarkovdMigrationManifest,
  markovdMigrationCatalogIds,
  type MarkovdMigrationCatalogIds
} from './markovd-migration-manifest-export'
import type { MarkovdMigrationSnapshotSource } from './markovd-migration-snapshot-coordinator'
import { collectUntransferredDependentBlockers } from './targets/ssh-target-markovd-dependents'
import type { MarkovdMigrationPreflightStore } from './targets/ssh-target-markovd-preflight'

export type MarkovdDeltaSourceStore = MarkovdMigrationPreflightStore &
  MarkovdMigrationSnapshotSource

export function unfinishedMarkovdDelta(
  chain: readonly MarkovdMigrationSourceCutover[]
): MarkovdMigrationSourceCutover | null {
  const head = chain.at(-1)
  return head?.supersedesMigrationId &&
    head.phase !== 'source-retired' &&
    !isRetainedMarkovdMigrationSourceCutover(head)
    ? head
    : null
}

export function committedMarkovdMigrationChain(
  chain: readonly MarkovdMigrationSourceCutover[]
): MarkovdMigrationSourceCutover[] {
  return (unfinishedMarkovdDelta(chain) ? chain.slice(0, -1) : chain).filter(
    (cutover) => cutover.phase === 'destination-committed' || cutover.phase === 'source-retired'
  )
}

export function markovdDeltaSourceStore(
  store: Store,
  target: SshTarget,
  moved: readonly MarkovdMigrationSourceCutover[],
  /** Older interrupted deltas may still include server-owned groups. */
  journaled?: MarkovdMigrationManifest
): MarkovdDeltaSourceStore {
  const ids = markovdMigrationCatalogIds(moved.map((cutover) => cutover.manifest.payload))
  // Never move projects/groups already owned through earlier links.
  const linked = moved.flatMap((cutover) => cutover.linkedRepositoryIds ?? [])
  const linkedGroups = moved.flatMap((cutover) => cutover.linkedProjectGroupIds ?? [])
  const linkedFolders = moved.flatMap((cutover) => cutover.linkedFolderWorkspaceIds ?? [])
  // New rows reference server-owned groups; exporting retained copies could overwrite newer server edits.
  const serverGroups = new Set([...ids.projectGroupIds, ...linkedGroups])
  const exported = new Set(journaled?.payload.projectGroups.map((group) => group.id))
  return markovdSourceStoreWithout(
    store,
    target,
    {
      ...ids,
      repositoryIds: new Set([...ids.repositoryIds, ...linked]),
      folderWorkspaceIds: new Set([...ids.folderWorkspaceIds, ...linkedFolders]),
      projectGroupIds: serverGroups
    },
    moved.at(-1)?.destinationEnvironmentId,
    new Set([...serverGroups].filter((id) => !exported.has(id)))
  )
}

export function markovdSourceStoreWithout(
  store: Store,
  target: SshTarget,
  owned: MarkovdMigrationCatalogIds,
  destinationEnvironmentId: string | undefined,
  /** Groups the server's record wins for: never exported, even while a moving row sits in one. */
  serverGroupIds: ReadonlySet<string> = new Set()
): MarkovdDeltaSourceStore {
  const ownedNow = createMarkovdMigrationManifest(store, target, {
    destinationEnvironmentId,
    onlyCatalog: owned
  })
  const view = store.createMarkovdMigrationDeltaView(ownedNow)
  return {
    ...view,
    serverOwnedProjectGroupIds: serverGroupIds,
    getSshTarget: (id) => store.getSshTarget(id),
    getSshRemotePtyLeases: (id) => store.getSshRemotePtyLeases(id),
    readMarkovdMigrationSourceSnapshotChunk: (...args) =>
      store.readMarkovdMigrationSourceSnapshotChunk(...args)
  }
}

export type MarkovdDeltaMovePlan = MarkovdDeltaMovePreview & {
  manifest: MarkovdMigrationManifest
  moved: MarkovdMigrationSourceCutover[]
  head: MarkovdMigrationSourceCutover
  resumes: MarkovdMigrationSourceCutover | null
  source: MarkovdDeltaSourceStore
}

export function planMarkovdDeltaMove(
  userDataPath: string,
  store: Store,
  target: SshTarget,
  options: { migrationId?: string; now?: () => Date } = {}
): MarkovdDeltaMovePlan {
  const environmentId = target.markovdFence?.environmentId
  if (!environmentId || !target.markovdFence?.sourceChangedAt) {
    throw new Error('markovd_delta_not_changed')
  }
  const chain = listMarkovdMigrationCutoverChainForTarget(userDataPath, target.id)
  const resumes = unfinishedMarkovdDelta(chain)
  const moved = committedMarkovdMigrationChain(chain)
  const head = chain.at(resumes ? -2 : -1)
  if (
    !head ||
    !isRetainedMarkovdMigrationSourceCutover(head) ||
    moved.at(-1)?.migrationId !== head.migrationId
  ) {
    throw new Error('markovd_delta_no_retained_migration')
  }
  const source = markovdDeltaSourceStore(store, target, moved, resumes?.manifest)
  const manifest =
    resumes?.manifest ??
    createMarkovdMigrationManifest(source, target, {
      migrationId: options.migrationId,
      now: options.now,
      destinationEnvironmentId: environmentId
    })
  const current = collectMarkovdMigrationSourceCatalog(store, target)
  return {
    sshTargetId: target.id,
    environmentId,
    added: catalogRows(manifest.payload),
    notReflected: notReflected(
      current,
      moved.map((cutover) => cutover.manifest.payload)
    ),
    blockers: collectUntransferredDependentBlockers(source, manifest),
    manifest,
    moved,
    head,
    resumes,
    source
  }
}

function catalogRows(catalog: MarkovdMigrationCatalogPayload): MarkovdDeltaMoveRow[] {
  return [
    ...catalog.repositories.map((row) => ({
      kind: 'repository' as const,
      id: row.id,
      label: row.displayName
    })),
    ...catalog.folderWorkspaces.map((row) => ({
      kind: 'folder-workspace' as const,
      id: row.id,
      label: row.name
    })),
    ...catalog.projectGroups.map((row) => ({
      kind: 'project-group' as const,
      id: row.id,
      label: row.name
    }))
  ]
}

/** Rows earlier migrations moved that an older build has since changed or removed. */
function notReflected(
  current: MarkovdMigrationCatalogPayload,
  movedPayloads: readonly MarkovdMigrationCatalogPayload[]
): MarkovdDeltaMovePreview['notReflected'] {
  const latestMoved = new Map<string, { row: MarkovdDeltaMoveRow; identity: string }>()
  for (const payload of movedPayloads) {
    for (const row of catalogRows(payload)) {
      latestMoved.set(`${row.kind}:${row.id}`, { row, identity: identityOf(payload, row) })
    }
  }
  const currentByKey = new Map(
    catalogRows(current).map((row) => [`${row.kind}:${row.id}`, identityOf(current, row)])
  )
  const edited: MarkovdDeltaMoveRow[] = []
  const removed: MarkovdDeltaMoveRow[] = []
  for (const [key, moved] of latestMoved) {
    const identity = currentByKey.get(key)
    if (identity === undefined) {
      removed.push(moved.row)
    } else if (identity !== moved.identity) {
      edited.push(moved.row)
    }
  }
  return { edited, removed }
}

function identityOf(catalog: MarkovdMigrationCatalogPayload, row: MarkovdDeltaMoveRow): string {
  switch (row.kind) {
    case 'repository': {
      const repo = catalog.repositories.find((entry) => entry.id === row.id)
      return `${repo?.path}\0${repo?.displayName}`
    }
    case 'folder-workspace': {
      const folder = catalog.folderWorkspaces.find((entry) => entry.id === row.id)
      return `${folder?.folderPath}\0${folder?.name}`
    }
    case 'project-group':
      return catalog.projectGroups.find((entry) => entry.id === row.id)?.name ?? ''
  }
}
