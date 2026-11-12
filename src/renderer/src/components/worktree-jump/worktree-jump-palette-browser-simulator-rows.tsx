import type React from 'react'
import { Smartphone } from 'lucide-react'
import { CommandItem } from '@/components/ui/command'
import { getPaletteHostBadge } from '@/components/cmd-j/palette-host-badge'
import type { BrowserPaletteItem, SimulatorPaletteItem } from './worktree-jump-palette-model'
import type { WorktreeJumpPaletteController } from './use-worktree-jump-palette-controller'
import {
  PaletteHostBadgeChip,
  PaletteLocationChip,
  PaletteOpenTabPrimaryLine
} from './worktree-jump-palette-primitives'
import {
  PaletteCurrentTabLabel,
  PaletteRowBody,
  PaletteRowTrailing
} from './worktree-jump-palette-row-layout'
import { formatPaletteSessionAge } from '@/components/cmd-j/palette-session-age'
import { resolvePaletteRepoForWorktree } from '@/lib/workspace/search/palette-repo-resolution'
import { BrowserFavicon } from '@/components/browser-favicon'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'

export function WorktreeJumpPaletteSimulatorRow({
  entry,
  renderKey,
  controller
}: {
  entry: SimulatorPaletteItem
  renderKey: string
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const result = entry.result
  const simulatorWorktree = controller.resolveWorktree(result.worktreeId, result.executionHostId)
  const simulatorRepo = simulatorWorktree
    ? resolvePaletteRepoForWorktree(
        simulatorWorktree,
        controller.repoMap,
        controller.repoByHostIdentity
      )
    : undefined
  const simulatorRepoName = simulatorRepo?.displayName ?? result.repoName
  const simulatorHostBadge = getPaletteHostBadge(
    result.executionHostId ?? (simulatorRepo && getRepoExecutionHostId(simulatorRepo)),
    controller.hostOptions,
    controller.hostFilterActive
  )
  const simulatorSessionAge = formatPaletteSessionAge(
    result.lastActiveAt ?? null,
    controller.paletteNowMs
  )

  return (
    <CommandItem
      value={renderKey}
      onSelect={() => controller.handleSelectItem(entry)}
      density="palette"
    >
      <div className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <Smartphone className="size-3.5" aria-hidden="true" />
      </div>
      <PaletteRowBody
        primary={
          <>
            <PaletteOpenTabPrimaryLine
              title={result.title}
              titleRanges={result.titleRanges}
              secondaryText={result.secondaryText}
              secondaryRanges={result.secondaryRanges}
              secondaryMatches={result.secondaryMatches}
              leadingBadges={<PaletteCurrentTabLabel result={result} />}
            />
            {result.typeAliasMatches.length ? (
              <span className="sr-only">
                {result.typeAliasMatches.map((match) => match.text).join(', ')}
              </span>
            ) : null}
          </>
        }
        context={
          <PaletteLocationChip
            repoName={simulatorRepoName}
            repoRanges={result.repoRanges}
            repoColor={simulatorRepo?.badgeColor}
            worktreeName={result.worktreeName}
            worktreeRanges={result.worktreeRanges}
          />
        }
        badges={<PaletteHostBadgeChip badge={simulatorHostBadge} />}
        trailing={
          <PaletteRowTrailing
            sessionAge={simulatorSessionAge}
            shortcutIndex={controller.recentTabShortcutIndexByItem.get(entry)}
            modifierKeys={controller.digitShortcutModifiers}
            showShortcut={controller.digitModifierHeld}
          />
        }
      />
    </CommandItem>
  )
}

export function WorktreeJumpPaletteBrowserRow({
  entry,
  renderKey,
  controller
}: {
  entry: BrowserPaletteItem
  renderKey: string
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const result = entry.result
  const browserWorktree = controller.resolveWorktree(result.worktreeId, result.executionHostId)
  const browserRepo = browserWorktree
    ? resolvePaletteRepoForWorktree(
        browserWorktree,
        controller.repoMap,
        controller.repoByHostIdentity
      )
    : undefined
  const browserRepoName = browserRepo?.displayName ?? result.repoName
  const browserHostBadge = getPaletteHostBadge(
    result.executionHostId ?? (browserRepo && getRepoExecutionHostId(browserRepo)),
    controller.hostOptions,
    controller.hostFilterActive
  )
  const browserSessionAge = formatPaletteSessionAge(
    result.lastActiveAt ?? null,
    controller.paletteNowMs
  )

  return (
    <CommandItem
      value={renderKey}
      onSelect={() => controller.handleSelectItem(entry)}
      density="palette"
    >
      <div className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <BrowserFavicon faviconUrl={result.faviconUrl} className="size-3.5" />
      </div>
      <PaletteRowBody
        primary={
          <PaletteOpenTabPrimaryLine
            title={result.title}
            titleRanges={result.titleRanges}
            secondaryText={result.secondaryText}
            secondaryRanges={result.secondaryRanges}
            secondaryMatches={result.secondaryMatches}
            elideSecondaryPathHead
            leadingBadges={
              <PaletteCurrentTabLabel
                result={{
                  isCurrentTab: result.isCurrentPage,
                  isCurrentWorktree: result.isCurrentWorktree
                }}
              />
            }
          />
        }
        context={
          <PaletteLocationChip
            repoName={browserRepoName}
            repoRanges={result.repoRanges}
            repoColor={browserRepo?.badgeColor}
            worktreeName={result.worktreeName}
            worktreeRanges={result.worktreeRanges}
          />
        }
        badges={<PaletteHostBadgeChip badge={browserHostBadge} />}
        trailing={
          <PaletteRowTrailing
            sessionAge={browserSessionAge}
            shortcutIndex={controller.recentTabShortcutIndexByItem.get(entry)}
            modifierKeys={controller.digitShortcutModifiers}
            showShortcut={controller.digitModifierHeld}
          />
        }
      />
    </CommandItem>
  )
}
