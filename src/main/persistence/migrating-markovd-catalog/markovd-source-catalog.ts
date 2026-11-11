import type { MarkovdMigrationCatalogPayload } from '../../../shared/markovd-migration/markovd-migration-manifest'
import { withoutMarkovdRetainedMarker } from '../../../shared/markovd-retained-marker'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { SshTarget } from '../../../shared/ssh-types'
import type { Store } from '../loading-store/store'
import {
  markovdSourceFolderWorkspaceIds,
  repoBelongsToMarkovdSource
} from './markovd-source-ownership'

type MarkovdSourceCatalogStore = Pick<
  Store,
  'getFolderWorkspaces' | 'getProjectGroups' | 'getRepos'
>

export function collectMarkovdMigrationSourceCatalog(
  store: MarkovdSourceCatalogStore,
  target: Pick<SshTarget, 'id'>
): MarkovdMigrationCatalogPayload {
  const allRepos = store.getRepos()
  const allGroups = store.getProjectGroups()
  const allFolders = store.getFolderWorkspaces()
  const repositories = allRepos
    .filter((repo) => repoBelongsToMarkovdSource(repo, target.id))
    .map(withoutMarkovdRetainedMarker)
  const ownedFolderIds = markovdSourceFolderWorkspaceIds(
    { repos: allRepos, projectGroups: allGroups, folderWorkspaces: allFolders },
    target.id
  )
  const folderWorkspaces = allFolders
    .filter((workspace) => ownedFolderIds.has(workspace.id))
    .map(withoutMarkovdRetainedMarker)
  const projectGroups = collectProjectGroups(
    allGroups,
    new Set([
      ...repositories.flatMap((repo) => (repo.projectGroupId ? [repo.projectGroupId] : [])),
      ...folderWorkspaces.map((workspace) => workspace.projectGroupId),
      ...allGroups.filter((group) => group.connectionId === target.id).map((group) => group.id)
    ])
  )
  return { repositories, projectGroups, folderWorkspaces }
}

export function collectProjectGroups(
  groups: ProjectGroup[],
  initialIds: ReadonlySet<string>
): ProjectGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const includedIds = new Set(initialIds)
  const pending = [...initialIds]
  while (pending.length > 0) {
    const nextId = pending.pop()
    if (!nextId) {
      continue
    }
    const group = byId.get(nextId)
    if (!group?.parentGroupId || includedIds.has(group.parentGroupId)) {
      continue
    }
    includedIds.add(group.parentGroupId)
    pending.push(group.parentGroupId)
  }
  return groups.filter((group) => includedIds.has(group.id)).map((group) => structuredClone(group))
}
