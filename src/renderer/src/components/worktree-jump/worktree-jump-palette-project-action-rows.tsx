import type React from 'react'
import { FolderTree } from 'lucide-react'
import { CommandItem } from '@/components/ui/command'
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'
import { getPaletteHostBadge } from '@/components/cmd-j/palette-host-badge'
import { translate } from '@/i18n/i18n'
import type {
  ProjectTargetPaletteItem,
  QuickActionPaletteItem,
  SettingsPaletteItem
} from './worktree-jump-palette-model'
import type { WorktreeJumpPaletteController } from './use-worktree-jump-palette-controller'
import { PaletteHostBadgeChip } from './worktree-jump-palette-primitives'
import { PaletteRowBody } from './worktree-jump-palette-row-layout'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import { BROWSER_NAVIGATION_ACTION_ID } from '../cmd-j/browser-navigation-action'

export function WorktreeJumpPaletteProjectRow({
  entry,
  renderKey,
  controller
}: {
  entry: ProjectTargetPaletteItem
  renderKey: string
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const result = entry.result
  const isProject = result.kind === 'project'
  const hostBadge = isProject
    ? getPaletteHostBadge(
        getRepoExecutionHostId(result.repo),
        controller.hostOptions,
        controller.hostFilterActive
      )
    : null
  const badgeLabel = isProject
    ? translate('auto.components.WorktreeJumpPalette.projectBadge', 'Project')
    : translate('auto.components.WorktreeJumpPalette.repoGroupBadge', 'Repo group')

  return (
    <CommandItem
      value={renderKey}
      onSelect={() => controller.handleSelectItem(entry)}
      density="palette"
    >
      <div className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <FolderTree className="size-3.5" aria-hidden="true" />
      </div>
      <PaletteRowBody
        primary={<span className="truncate text-[13px] text-foreground">{result.title}</span>}
        context={
          isProject && result.repo.displayName !== result.title ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
              <RepoBadgeMark color={result.repo.badgeColor} />
              <span className="truncate">{result.repo.displayName}</span>
            </span>
          ) : null
        }
        badges={<PaletteHostBadgeChip badge={hostBadge} />}
        trailing={<span className="shrink-0 text-[12px] text-muted-foreground">{badgeLabel}</span>}
      />
    </CommandItem>
  )
}

export function WorktreeJumpPaletteActionRow({
  entry,
  renderKey,
  controller
}: {
  entry: SettingsPaletteItem | QuickActionPaletteItem
  renderKey: string
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const result = entry.result
  const Icon = result.icon
  const kindLabel =
    entry.type === 'settings'
      ? translate('auto.components.WorktreeJumpPalette.settingsBadge', 'Settings')
      : result.id === BROWSER_NAVIGATION_ACTION_ID
        ? translate('worktreeJumpPalette.websiteBadge', 'Website')
        : translate('auto.components.WorktreeJumpPalette.actionBadge', 'Action')

  return (
    <CommandItem
      value={renderKey}
      onSelect={() => controller.handleSelectItem(entry)}
      density="palette"
    >
      <div className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </div>
      <PaletteRowBody
        primary={<span className="truncate text-[13px] text-foreground">{result.title}</span>}
        context={
          <span className="truncate text-[12px] text-muted-foreground">{result.description}</span>
        }
        trailing={<span className="shrink-0 text-[12px] text-muted-foreground">{kindLabel}</span>}
      />
    </CommandItem>
  )
}
