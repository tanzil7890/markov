import type React from 'react'
import { FileText, MessageSquare, SquareTerminal } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-catalog'
import { CommandItem } from '@/components/ui/command'
import { PaletteRecentTabStatusDot } from '@/components/cmd-j/palette-live-status'
import { getPaletteHostBadge } from '@/components/cmd-j/palette-host-badge'
import type { WorkspaceTabPaletteItem } from './worktree-jump-palette-model'
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
import { getPaletteTabPeekText } from './worktree-jump-palette-tab-peek'
import { formatPaletteSessionAge } from '@/components/cmd-j/palette-session-age'
import { resolvePaletteRepoForWorktree } from '@/lib/workspace/search/palette-repo-resolution'
import { isEditorTabContentType } from '@/store/slices/editor/tabs/editor-tab-content-type'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'

export function WorktreeJumpPaletteWorkspaceTabRow({
  entry,
  renderKey,
  controller
}: {
  entry: WorkspaceTabPaletteItem
  renderKey: string
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const result = entry.result
  const workspaceTabWorktree = controller.resolveWorktree(result.worktreeId, result.executionHostId)
  const workspaceTabRepo = workspaceTabWorktree
    ? resolvePaletteRepoForWorktree(
        workspaceTabWorktree,
        controller.repoMap,
        controller.repoByHostIdentity
      )
    : undefined
  const workspaceTabRepoName = workspaceTabRepo?.displayName ?? result.repoName
  const workspaceTabHostBadge = getPaletteHostBadge(
    result.executionHostId ?? (workspaceTabRepo && getRepoExecutionHostId(workspaceTabRepo)),
    controller.hostOptions,
    controller.hostFilterActive
  )
  const recentRow = controller.recentTabRowByItem.get(entry) ?? null
  const fallback = result.occupantAgent ? (
    <span className="inline-flex" data-agent-icon={result.occupantAgent} aria-hidden="true">
      <AgentIcon agent={result.occupantAgent} size={14} />
    </span>
  ) : result.contentType === 'terminal' ? (
    <SquareTerminal className="size-3.5" aria-hidden="true" />
  ) : result.contentType === 'agent-session' ? (
    <MessageSquare className="size-3.5" aria-hidden="true" />
  ) : (
    <FileText className="size-3.5" aria-hidden="true" />
  )
  const sessionAge = formatPaletteSessionAge(result.lastActiveAt ?? null, controller.paletteNowMs)

  const selected = controller.commandSelectedItemId === renderKey
  const peek =
    selected && result.contentType !== 'editor'
      ? getPaletteTabPeekText(controller.agentStatusByPaneKey, [result.tabId, result.entityId])
      : null

  return (
    <CommandItem
      value={renderKey}
      onSelect={() => controller.handleSelectItem(entry)}
      density="palette"
    >
      <div className="flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground">
        <PaletteRecentTabStatusDot row={recentRow} fallback={fallback} />
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
              elideSecondaryPathHead={isEditorTabContentType(result.contentType)}
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
            repoName={workspaceTabRepoName}
            repoRanges={result.repoRanges}
            repoColor={workspaceTabRepo?.badgeColor}
            worktreeName={result.worktreeName}
            worktreeRanges={result.worktreeRanges}
          />
        }
        badges={<PaletteHostBadgeChip badge={workspaceTabHostBadge} />}
        trailing={
          <PaletteRowTrailing
            sessionAge={sessionAge}
            shortcutIndex={controller.recentTabShortcutIndexByItem.get(entry)}
            modifierKeys={controller.digitShortcutModifiers}
            showShortcut={controller.digitModifierHeld}
          />
        }
        peek={peek}
      />
    </CommandItem>
  )
}
