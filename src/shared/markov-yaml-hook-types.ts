export type SetupRunPolicy = 'ask' | 'run-by-default' | 'skip-by-default'
export type SetupAgentStartupPolicy = 'start-immediately' | 'wait-for-setup'
export type HookCommandSourcePolicy = 'shared-only' | 'local-only' | 'run-both'

export type MarkovHooks = {
  scripts: {
    setup?: string // Runs after worktree is created
    archive?: string // Runs before worktree is archived
  }
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  issueCommand?: string // Shared default command for linked GitHub issues
  defaultTabs?: MarkovDefaultTabTemplate[] // Terminal tabs to create once for a new worktree
  environmentRecipes?: MarkovVmRecipe[] // Project-scoped per-workspace environment recipes
  environmentRecipeDiagnostics?: MarkovVmRecipeDiagnostic[] // Non-fatal validation issues from environmentRecipes
  worktree?: MarkovWorktreeDefaults // Project-scoped defaults applied when a worktree is created
}

export type MarkovWorktreeDefaults = {
  // Share large rebuildable directories such as node_modules across worktrees instead of copying installs.
  sharedDirectories?: string[]
}

export type MarkovDefaultTabTemplate = {
  title?: string
  color?: string
  command?: string
}

export type EphemeralVmCheckoutMode = 'markov-worktree' | 'provisioned-root'

export type MarkovVmRecipe = {
  id: string
  name: string
  create: string
  checkoutMode?: EphemeralVmCheckoutMode
  description?: string
  suspend?: string
  resume?: string
  destroy?: string
  destroyDisabled?: boolean
}

export type MarkovVmRecipeDiagnostic = {
  index: number
  field?: string
  message: string
}

export type RepoHookSettings = {
  // Retain the old hook-UI mode so persisted state reads without migration.
  mode: 'auto' | 'override'
  setupRunPolicy?: SetupRunPolicy
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  commandSourcePolicy?: HookCommandSourcePolicy
  scripts: {
    setup: string
    archive: string
  }
}

export type PersistedTrustedMarkovHookEntry = {
  contentHash: string
  approvedAt: number
}

export type PersistedTrustedMarkovHookRepo = {
  all?: {
    approvedAt: number
  }
  setup?: PersistedTrustedMarkovHookEntry
  archive?: PersistedTrustedMarkovHookEntry
  issueCommand?: PersistedTrustedMarkovHookEntry
  vmRecipe?: PersistedTrustedMarkovHookEntry
}

export type PersistedTrustedMarkovHooks = Record<string, PersistedTrustedMarkovHookRepo>
