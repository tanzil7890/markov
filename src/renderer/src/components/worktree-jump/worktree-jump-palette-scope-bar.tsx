import type React from 'react'
import PaletteFilterMenu from '@/components/cmd-j/PaletteFilterMenu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { WorktreeJumpPaletteController } from './use-worktree-jump-palette-controller'
import {
  getPaletteScopeLabel,
  PALETTE_SCOPES,
  type PaletteScope
} from './worktree-jump-palette-scope'

function getPaletteScopeCounts(
  controller: WorktreeJumpPaletteController
): Record<PaletteScope, number> | null {
  if (!controller.hasQuery) {
    return null
  }
  const tabs = controller.openTabItems.length
  const workspaces = controller.worktreeItems.length
  const tasks = controller.taskItems.length
  const actions = controller.middleItems.length + controller.projectTargetItems.length
  return { all: tabs + workspaces + tasks + actions, tabs, workspaces, tasks, actions }
}

/** Scope buttons and the project filter; Tab in the search box steps through the scopes. */
export function WorktreeJumpPaletteScopeBar({
  controller
}: {
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const counts = getPaletteScopeCounts(controller)
  return (
    <div ref={controller.setDialogElementFromNode} className="flex items-center gap-2 px-3 pt-2">
      <div
        role="group"
        aria-label={translate('worktreeJumpPalette.scope.label', 'Search in')}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5"
      >
        {PALETTE_SCOPES.map((scope) => {
          const active = controller.scope === scope
          const count = counts?.[scope]
          return (
            <button
              key={scope}
              type="button"
              // Why: Tab in the search box already steps through scopes; these stay out of the tab order.
              tabIndex={-1}
              aria-pressed={active}
              data-palette-scope={scope}
              onClick={() => {
                controller.selectScope(scope)
                controller.focusPaletteInput()
              }}
              className={cn(
                'flex h-6 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
                active
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {getPaletteScopeLabel(scope)}
              {count !== undefined && count > 0 ? (
                <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
              ) : null}
            </button>
          )
        })}
      </div>
      <PaletteFilterMenu
        model={controller.filterModel}
        filter={controller.filter}
        onFilterChange={controller.setFilter}
        onRequestInputFocus={controller.focusPaletteInput}
        portalContainer={controller.dialogElement}
      />
    </div>
  )
}
