import type React from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  CREATE_WORKSPACE_QUICK_ACTION_ID,
  getCmdJQuickActions
} from '@/components/cmd-j/quick-actions'
import type { CmdJQuickAction } from '@/components/cmd-j/quick-actions'
import { getNewAgentQuickAction } from '@/components/cmd-j/new-agent-quick-action'
import type { WorktreeJumpPaletteController } from './use-worktree-jump-palette-controller'

const START_ACTION_IDS = ['new-terminal-tab', CREATE_WORKSPACE_QUICK_ACTION_ID]

function getStartActionLabel(action: CmdJQuickAction): string {
  if (action.id === 'new-terminal-tab') {
    return translate('worktreeJumpPalette.start.newTerminal', 'New terminal')
  }
  if (action.id === CREATE_WORKSPACE_QUICK_ACTION_ID) {
    return translate('worktreeJumpPalette.start.newWorkspace', 'New workspace')
  }
  return action.title
}

/** The common ways to start something, offered while the search box is empty. */
export function WorktreeJumpPaletteStartActions({
  controller
}: {
  controller: WorktreeJumpPaletteController
}): React.JSX.Element | null {
  const context = controller.buildQuickActionContext()
  const actions = [
    getNewAgentQuickAction(),
    ...getCmdJQuickActions().filter((action) => START_ACTION_IDS.includes(action.id))
  ].filter((action) => action.isAvailable(context).available)
  if (actions.length === 0) {
    return null
  }
  return (
    <div
      role="group"
      aria-label={translate('worktreeJumpPalette.start.label', 'Start something new')}
      className="flex flex-wrap gap-2 px-4 pt-1.5 pb-0.5"
    >
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Button
            key={action.id}
            type="button"
            variant="outline"
            size="xs"
            onClick={() =>
              controller.handleSelectItem({
                id: `quick-action:${action.id}`,
                type: 'quick-action',
                result: { ...action, order: 0, qualityClass: 'exact-intent' }
              })
            }
          >
            <Icon aria-hidden="true" />
            {getStartActionLabel(action)}
          </Button>
        )
      })}
    </div>
  )
}
