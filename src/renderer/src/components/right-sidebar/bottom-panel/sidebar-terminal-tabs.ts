import { useAppStore } from '@/store'
import { pushRecentTabId, sanitizeRecentTabIds, updateGroup } from '@/store/slices/tab-group-state'
import { runQuickCommandInNewTab } from '@/lib/run-quick-command-in-new-tab'
import {
  findRightSidebarTabGroup,
  rightSidebarTabGroupId
} from '../../../../../shared/workspace-layout/right-sidebar-tab-group'
import {
  flattenTerminalQuickCommand,
  isTerminalAgentQuickCommand
} from '../../../../../shared/terminal/quick-commands/terminal-quick-commands'
import type { TerminalQuickCommand } from '../../../../../shared/terminal/quick-commands/terminal-quick-command-types'
import { useRightSidebarBottomPanel } from './right-sidebar-bottom-panel-state'

const SEEDED_KEY = 'markov.right-sidebar-terminal-seeded.v1'
const SEEDED_LIMIT = 500
let seededCache: string[] | null = null

function readSeeded(): string[] {
  if (seededCache) {
    return seededCache
  }
  try {
    const parsed: unknown = JSON.parse(globalThis.localStorage?.getItem(SEEDED_KEY) ?? '[]')
    seededCache = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    seededCache = []
  }
  return seededCache
}

export function hasSeededSidebarTerminal(worktreeId: string): boolean {
  return readSeeded().includes(worktreeId)
}

export function markSidebarTerminalSeeded(worktreeId: string): void {
  const next = [...readSeeded().filter((id) => id !== worktreeId), worktreeId].slice(-SEEDED_LIMIT)
  seededCache = next
  try {
    globalThis.localStorage?.setItem(SEEDED_KEY, JSON.stringify(next))
  } catch {
    // Why: without storage the sidebar only reopens its first terminal once per run.
  }
}

/** The workspace's sidebar group, added after its main group so the main area keeps its own root. */
function ensureSidebarTerminalGroup(worktreeId: string): string {
  const groupId = rightSidebarTabGroupId(worktreeId)
  if (findRightSidebarTabGroup(useAppStore.getState().groupsByWorktree[worktreeId])) {
    return groupId
  }
  useAppStore.getState().ensureWorktreeRootGroup(worktreeId)
  useAppStore.setState((state) => {
    const groups = state.groupsByWorktree[worktreeId] ?? []
    if (findRightSidebarTabGroup(groups)) {
      return state
    }
    return {
      groupsByWorktree: {
        ...state.groupsByWorktree,
        [worktreeId]: [
          ...groups,
          { id: groupId, worktreeId, activeTabId: null, tabOrder: [], recentTabIds: [] }
        ]
      }
    }
  })
  return groupId
}

/** Show a sidebar terminal without touching the main area's active tab or group. */
export function activateSidebarTerminal(worktreeId: string, unifiedTabId: string): void {
  useAppStore.setState((state) => {
    const groups = state.groupsByWorktree[worktreeId] ?? []
    const group = findRightSidebarTabGroup(groups)
    if (!group || !group.tabOrder.includes(unifiedTabId) || group.activeTabId === unifiedTabId) {
      return state
    }
    return {
      groupsByWorktree: {
        ...state.groupsByWorktree,
        [worktreeId]: updateGroup(groups, {
          ...group,
          activeTabId: unifiedTabId,
          recentTabIds: pushRecentTabId(
            sanitizeRecentTabIds(group.recentTabIds, group.tabOrder),
            unifiedTabId
          )
        })
      }
    }
  })
}

export function createSidebarTerminal(
  worktreeId: string,
  options?: { quickCommandLabel?: string; startupCommand?: string }
): void {
  const groupId = ensureSidebarTerminalGroup(worktreeId)
  const before = useAppStore.getState()
  const previousActiveTabId = before.activeTabIdByWorktree[worktreeId] ?? null
  const tab = before.createTab(worktreeId, groupId, undefined, {
    activate: false,
    ...(options?.quickCommandLabel ? { quickCommandLabel: options.quickCommandLabel } : {}),
    ...(options?.startupCommand ? { pendingStartup: { command: options.startupCommand } } : {})
  })
  // Why: an empty main area would otherwise adopt the sidebar terminal as its active tab.
  if (useAppStore.getState().activeTabIdByWorktree[worktreeId] === tab.id) {
    useAppStore.setState((state) => ({
      activeTabIdByWorktree: { ...state.activeTabIdByWorktree, [worktreeId]: previousActiveTabId }
    }))
  }
  const unified = useAppStore
    .getState()
    .unifiedTabsByWorktree[worktreeId]?.find(
      (entry) => entry.entityId === tab.id && entry.contentType === 'terminal'
    )
  if (unified) {
    activateSidebarTerminal(worktreeId, unified.id)
  }
}

/** Shell commands run in a new sidebar terminal; prompts for an agent still open as a chat. */
export function runQuickCommandFromSidebar({
  command,
  worktreeId
}: {
  command: TerminalQuickCommand
  worktreeId: string
}): void {
  if (isTerminalAgentQuickCommand(command)) {
    runQuickCommandInNewTab({ command, worktreeId })
    return
  }
  const startupCommand = flattenTerminalQuickCommand(command).command
  // Reject whitespace-only input before spawning an unexplained empty terminal.
  if (!startupCommand.trim()) {
    return
  }
  useRightSidebarBottomPanel.getState().setView('terminal')
  createSidebarTerminal(worktreeId, { quickCommandLabel: command.label, startupCommand })
}
