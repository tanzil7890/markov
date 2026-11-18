import { useCallback, useSyncExternalStore } from 'react'

export type WorktreeAgentExpansionState = {
  // Child lists start collapsed so spawning subagents cannot grow the card and shift the sidebar.
  expandedLineageParents: ReadonlySet<string>
  expandedIdleChildGroups: ReadonlySet<string>
  compactRootListExpanded: boolean
}

const EMPTY_PANE_KEYS: ReadonlySet<string> = new Set()

const DEFAULT_EXPANSION_STATE: WorktreeAgentExpansionState = {
  expandedLineageParents: EMPTY_PANE_KEYS,
  expandedIdleChildGroups: EMPTY_PANE_KEYS,
  compactRootListExpanded: false
}

// Retain disclosures across virtualizer/lineage remounts in a bounded renderer-session cache; reload resets them.
export const MAX_PERSISTED_WORKTREE_AGENT_EXPANSIONS = 512
const expansionByWorktreeId = new Map<string, WorktreeAgentExpansionState>()
// Why shared: the card's title-row toggle and the list below it are separate components.
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function trimPersistedExpansions(): void {
  while (expansionByWorktreeId.size > MAX_PERSISTED_WORKTREE_AGENT_EXPANSIONS) {
    const oldest = expansionByWorktreeId.keys().next().value
    if (oldest === undefined) {
      break
    }
    expansionByWorktreeId.delete(oldest)
  }
}

function readExpansionState(worktreeId: string): WorktreeAgentExpansionState {
  return expansionByWorktreeId.get(worktreeId) ?? DEFAULT_EXPANSION_STATE
}

function persistExpansionState(worktreeId: string, state: WorktreeAgentExpansionState): void {
  // Refresh LRU order and retain only non-default disclosures.
  expansionByWorktreeId.delete(worktreeId)
  if (
    state.compactRootListExpanded ||
    state.expandedLineageParents.size > 0 ||
    state.expandedIdleChildGroups.size > 0
  ) {
    expansionByWorktreeId.set(worktreeId, state)
    trimPersistedExpansions()
  }
  for (const listener of listeners) {
    listener()
  }
}

function toggleKey(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(keys)
  if (!next.delete(key)) {
    next.add(key)
  }
  return next
}

export type WorktreeAgentExpansionControls = {
  expandedLineageParents: ReadonlySet<string>
  expandedIdleChildGroups: ReadonlySet<string>
  compactRootListExpanded: boolean
  toggleLineageParent: (paneKey: string) => void
  toggleIdleChildGroup: (parentPaneKey: string) => void
  toggleCompactRootList: () => void
}

/** Restore each worktree’s disclosures across virtualizer and sibling-lineage remounts. */
export function useWorktreeAgentExpansionState(worktreeId: string): WorktreeAgentExpansionControls {
  const current = useSyncExternalStore(subscribe, () => readExpansionState(worktreeId))

  const toggleLineageParent = useCallback(
    (paneKey: string) => {
      const base = readExpansionState(worktreeId)
      persistExpansionState(worktreeId, {
        ...base,
        expandedLineageParents: toggleKey(base.expandedLineageParents, paneKey)
      })
    },
    [worktreeId]
  )

  const toggleIdleChildGroup = useCallback(
    (parentPaneKey: string) => {
      const base = readExpansionState(worktreeId)
      persistExpansionState(worktreeId, {
        ...base,
        expandedIdleChildGroups: toggleKey(base.expandedIdleChildGroups, parentPaneKey)
      })
    },
    [worktreeId]
  )

  const toggleCompactRootList = useCallback(() => {
    const base = readExpansionState(worktreeId)
    persistExpansionState(worktreeId, {
      ...base,
      compactRootListExpanded: !base.compactRootListExpanded
    })
  }, [worktreeId])

  return {
    expandedLineageParents: current.expandedLineageParents,
    expandedIdleChildGroups: current.expandedIdleChildGroups,
    compactRootListExpanded: current.compactRootListExpanded,
    toggleLineageParent,
    toggleIdleChildGroup,
    toggleCompactRootList
  }
}

/** Whether the card's chat list is open under its title, without the toggles. */
export function useWorktreeChatListOpen(worktreeId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readExpansionState(worktreeId).compactRootListExpanded
  )
}

export function clearWorktreeAgentExpansionStateForTests(): void {
  expansionByWorktreeId.clear()
}

export function getWorktreeAgentExpansionCountForTests(): number {
  return expansionByWorktreeId.size
}

export function seedWorktreeAgentExpansionStateForTests(
  worktreeId: string,
  state: WorktreeAgentExpansionState
): void {
  persistExpansionState(worktreeId, state)
}
