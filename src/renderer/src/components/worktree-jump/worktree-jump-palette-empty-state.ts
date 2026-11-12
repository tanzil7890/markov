import { translate } from '@/i18n/i18n'
import type { WorktreeJumpPaletteController } from './use-worktree-jump-palette-controller'
import type { PaletteScope } from './worktree-jump-palette-scope'

export function getWorktreeJumpPaletteResultCount(
  controller: WorktreeJumpPaletteController
): number {
  return controller.hasQuery && controller.scope === 'all'
    ? controller.worktreeItems.length +
        controller.projectTargetItems.length +
        controller.middleItems.length +
        controller.openTabItems.length +
        controller.taskItems.length
    : controller.selectableItems.length
}

export function getWorktreeJumpPaletteEmptyState(controller: WorktreeJumpPaletteController): {
  title: string
  subtitle: string
} {
  if (controller.filterActive) {
    return {
      title: translate(
        'worktreeJumpPalette.filter.emptyTitle',
        'No results match the active filter'
      ),
      subtitle: translate(
        'worktreeJumpPalette.filter.emptySubtitle',
        'Clear the filter above, or widen it to more hosts and projects.'
      )
    }
  }
  if (controller.scope !== 'all') {
    return getScopedEmptyState(controller.scope, controller.hasQuery)
  }
  if (
    (controller.hasAnySearchableWorktrees ||
      controller.hasAnyProjectSearchCandidates ||
      controller.hasAnyMiddleResults ||
      controller.hasAnyOpenTabs) &&
    controller.hasQuery
  ) {
    return {
      title: translate(
        'auto.components.WorktreeJumpPalette.dbd9d87eec',
        'No results match your search'
      ),
      subtitle: translate(
        'auto.components.WorktreeJumpPalette.c4afa68159',
        'Try a worktree, project, setting, action, tab title, agent prompt, URL, PR, or port.'
      )
    }
  }
  if (!controller.hasQuery && controller.hasAnyWorktrees && !controller.hasAnyOpenTabs) {
    return {
      title: translate(
        'auto.components.WorktreeJumpPalette.f60f8730be',
        'No other worktrees to switch to'
      ),
      subtitle: translate(
        'auto.components.WorktreeJumpPalette.b781ae05e3',
        'Type to search worktrees, settings, tabs, and actions.'
      )
    }
  }
  return {
    title: translate(
      'auto.components.WorktreeJumpPalette.1628fd7dfa',
      'No active worktrees, settings, actions, or open tabs'
    ),
    subtitle: translate(
      'auto.components.WorktreeJumpPalette.f7fda8d562',
      'Create a worktree or open a tab in Markov to get started.'
    )
  }
}

function getScopedEmptyState(
  scope: Exclude<PaletteScope, 'all'>,
  hasQuery: boolean
): { title: string; subtitle: string } {
  const tryAll = translate(
    'worktreeJumpPalette.scope.emptyTryAll',
    'Choose All to search everything.'
  )
  switch (scope) {
    case 'tabs':
      return hasQuery
        ? {
            title: translate('worktreeJumpPalette.scope.tabsNoMatch', 'No open tabs match'),
            subtitle: tryAll
          }
        : {
            title: translate('worktreeJumpPalette.scope.tabsEmpty', 'No open tabs'),
            subtitle: translate(
              'worktreeJumpPalette.scope.tabsEmptyHint',
              'Chats, terminals and files you open show up here.'
            )
          }
    case 'workspaces':
      return {
        title: hasQuery
          ? translate('worktreeJumpPalette.scope.workspacesNoMatch', 'No workspaces match')
          : translate('worktreeJumpPalette.scope.workspacesEmpty', 'No other workspaces'),
        subtitle: tryAll
      }
    case 'tasks':
      return hasQuery
        ? {
            title: translate('worktreeJumpPalette.scope.tasksNoMatch', 'No open issues match'),
            subtitle: translate(
              'worktreeJumpPalette.scope.tasksNoMatchHint',
              'Tasks searches open GitHub and GitLab issues in your projects.'
            )
          }
        : {
            title: translate('worktreeJumpPalette.scope.tasksEmpty', 'Search open issues'),
            subtitle: translate(
              'worktreeJumpPalette.scope.tasksEmptyHint',
              'Type an issue title, or paste an issue link.'
            )
          }
    case 'actions':
      return hasQuery
        ? {
            title: translate(
              'worktreeJumpPalette.scope.actionsNoMatch',
              'No actions or settings match'
            ),
            subtitle: tryAll
          }
        : {
            title: translate(
              'worktreeJumpPalette.scope.actionsEmpty',
              'Search actions and settings'
            ),
            subtitle: translate(
              'worktreeJumpPalette.scope.actionsEmptyHint',
              'Type what you want to do, like new terminal or theme.'
            )
          }
  }
}
