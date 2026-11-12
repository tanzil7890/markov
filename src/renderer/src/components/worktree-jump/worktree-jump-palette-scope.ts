import { translate } from '@/i18n/i18n'

/** Which kinds of results the palette lists; `all` keeps the mixed, ranked view. */
export type PaletteScope = 'all' | 'tabs' | 'workspaces' | 'tasks' | 'actions'

export const PALETTE_SCOPES: readonly PaletteScope[] = [
  'all',
  'tabs',
  'workspaces',
  'tasks',
  'actions'
]

export function getPaletteScopeLabel(scope: PaletteScope): string {
  switch (scope) {
    case 'all':
      return translate('worktreeJumpPalette.scope.all', 'All')
    case 'tabs':
      return translate('worktreeJumpPalette.scope.tabs', 'Tabs')
    case 'workspaces':
      return translate('worktreeJumpPalette.scope.workspaces', 'Workspaces')
    case 'tasks':
      return translate('worktreeJumpPalette.scope.tasks', 'Tasks')
    case 'actions':
      return translate('worktreeJumpPalette.scope.actions', 'Actions & settings')
  }
}

/** Steps through scopes; null past either end so Tab can leave the input instead of trapping focus. */
export function stepPaletteScope(scope: PaletteScope, direction: 1 | -1): PaletteScope | null {
  return PALETTE_SCOPES[PALETTE_SCOPES.indexOf(scope) + direction] ?? null
}

export function paletteScopeShowsCreateRow(scope: PaletteScope): boolean {
  return scope === 'all' || scope === 'workspaces'
}
