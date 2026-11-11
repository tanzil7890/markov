import type { FolderWorkspace } from '../folder-workspaces/folder-workspace-types'
import type { Repo } from '../repo-types'
import type { SavedPortForward, SshRemotePtyLease } from '../ssh-types'

export const MARKOVD_MIGRATION_DEPENDENCY_KINDS = [
  'saved-port-forward',
  'terminal-lease',
  'terminal-recovery',
  'workspace-session',
  'worktree-metadata',
  'worktree-lineage',
  'workspace-lineage',
  'sparse-preset',
  'retired-worktree-name',
  'automation',
  'automation-run',
  'mobile-tab-selection',
  'ui-routing'
] as const

export type MarkovdMigrationDependencyKind = (typeof MARKOVD_MIGRATION_DEPENDENCY_KINDS)[number]

export type MarkovdMigrationDependency = {
  kind: MarkovdMigrationDependencyKind
  count: number
  /** A bounded sample of what holds the reference, so the user can find and clear it. */
  names?: string[]
}

export type MarkovdMigrationRepository = Pick<Repo, 'id' | 'path' | 'displayName' | 'kind'>
export type MarkovdMigrationFolderWorkspace = Pick<FolderWorkspace, 'id' | 'name' | 'folderPath'>
export type MarkovdMigrationTerminalLease = Pick<
  SshRemotePtyLease,
  'ptyId' | 'worktreeId' | 'tabId' | 'leafId' | 'state' | 'updatedAt'
>

export type MarkovdMigrationBlocker =
  | {
      code: 'markovd_migration_target_not_found'
      category: 'registration'
    }
  | {
      code: 'markovd_migration_target_owned'
      category: 'exclusive-ownership'
      holder:
        | { kind: 'runtime'; runtimeId: string }
        | { kind: 'managed-server'; environmentId: string }
    }
  | {
      /** Owned by the asking environment, but no durable record of why. */
      code: 'markovd_migration_owner_unrecorded'
      category: 'exclusive-ownership'
    }
  | {
      code: 'markovd_migration_direct_ssh_repositories'
      category: 'drainable-static-state'
      repositories: MarkovdMigrationRepository[]
    }
  | {
      code: 'markovd_migration_direct_ssh_folder_workspaces'
      category: 'drainable-static-state'
      folderWorkspaces: MarkovdMigrationFolderWorkspace[]
    }
  | {
      code: 'markovd_migration_direct_ssh_terminal_leases'
      category: 'live-or-unverifiable'
      terminalLeases: MarkovdMigrationTerminalLease[]
    }
  | {
      code: 'markovd_migration_saved_port_forwards'
      category: 'client-owned-state'
      portForwards: SavedPortForward[]
    }
  | {
      code: 'markovd_migration_dependent_state'
      category: 'client-owned-state'
      dependencies: MarkovdMigrationDependency[]
    }
  | {
      code: 'markovd_migration_dependency_unverifiable'
      category: 'live-or-unverifiable'
      sources: MarkovdMigrationDependencyKind[]
    }

export type MarkovdMigrationPreflight = {
  targetId: string
  targetLabel: string | null
  claimable: boolean
  blockers: MarkovdMigrationBlocker[]
}
