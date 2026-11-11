import { vi } from 'vitest'
import type { RuntimeStore } from './runtime-store-contract'

/** Keep main-owned pane bindings in the fixture's session layout. */
export function mailboxLayoutStore(): RuntimeStore {
  return {
    getRepos: () => [],
    getRepo: () => undefined,
    addRepo: vi.fn<RuntimeStore['addRepo']>(),
    updateRepo: vi.fn<RuntimeStore['updateRepo']>(),
    getAllWorktreeMeta: () => ({}),
    getWorktreeMeta: () => undefined,
    setWorktreeMeta: vi.fn<RuntimeStore['setWorktreeMeta']>(),
    removeWorktreeMeta: vi.fn<RuntimeStore['removeWorktreeMeta']>(),
    getGitHubCache: vi.fn<RuntimeStore['getGitHubCache']>(),
    getSettings: () => ({
      workspaceDir: '/workspaces',
      nestWorkspaces: false,
      refreshLocalBaseRefOnWorktreeCreate: false,
      branchPrefix: 'none',
      branchPrefixCustom: ''
    })
  }
}
