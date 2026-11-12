import type React from 'react'
import { Server, ServerOff } from 'lucide-react'
import { CommandItem } from '@/components/ui/command'
import { PaletteWorktreeStatusDot } from '@/components/cmd-j/palette-live-status'
import { RepoBadgeMark } from '@/components/repo/RepoBadgeLabel'
import { getPaletteHostBadge } from '@/components/cmd-j/palette-host-badge'
import {
  resolveWorktreeBranchLabel,
  resolveWorktreeDisplayName
} from '@/lib/worktree-default-display-name'
import { translate } from '@/i18n/i18n'
import {
  getRepoExecutionHostId,
  isRuntimeOwnedSshTargetId
} from '../../../../shared/execution-host'
import {
  isPaletteCurrentWorktree,
  getPaletteWorktreeExecutionHostId,
  resolvePaletteRepoForWorktree
} from '@/lib/workspace/search/palette-repo-resolution'
import { formatPaletteSessionAge } from '@/components/cmd-j/palette-session-age'
import type { WorktreePaletteItem } from './worktree-jump-palette-model'
import type { WorktreeJumpPaletteController } from './use-worktree-jump-palette-controller'
import { getWorkspaceLastActiveAt } from '../../../../shared/workspace-last-active'
import { getWorktreeVisitTimestamp } from '@/lib/worktree-visit-recency'
import {
  getPaletteSupportingTextLabel,
  HighlightedText,
  PaletteHostBadgeChip
} from './worktree-jump-palette-primitives'
import { PaletteRowBody, PaletteRowTrailing } from './worktree-jump-palette-row-layout'

export function WorktreeJumpPaletteWorktreeRow({
  entry,
  renderKey,
  controller
}: {
  entry: WorktreePaletteItem
  renderKey: string
  controller: WorktreeJumpPaletteController
}): React.JSX.Element {
  const {
    repoMap,
    activeWorktreeId,
    sshConnectionStates,
    hostOptions,
    hostFilterActive,
    handleSelectItem
  } = controller
  const worktree = entry.worktree
  const repo = resolvePaletteRepoForWorktree(worktree, repoMap, controller.repoByHostIdentity)
  const repoName = repo?.displayName ?? ''
  const branch = resolveWorktreeBranchLabel(worktree)
  const worktreeLabel = resolveWorktreeDisplayName(worktree)
  const isCurrentWorktree = isPaletteCurrentWorktree(
    worktree,
    activeWorktreeId,
    controller.activeWorkspaceExecutionHostId
  )
  const sessionAge = formatPaletteSessionAge(
    controller.hasQuery
      ? entry.match.lastActiveAt
      : getWorkspaceLastActiveAt(
          worktree.lastActivityAt,
          getWorktreeVisitTimestamp(controller.lastVisitedAtByWorktreeId, worktree)
        ),
    controller.paletteNowMs
  )
  const sshConnectionId =
    repo?.connectionId && !isRuntimeOwnedSshTargetId(repo.connectionId) ? repo.connectionId : null
  const sshStatus = sshConnectionId
    ? (sshConnectionStates.get(sshConnectionId)?.status ?? 'disconnected')
    : null
  const isSshDisconnected = sshStatus != null && sshStatus !== 'connected'
  const hostBadge = getPaletteHostBadge(
    getPaletteWorktreeExecutionHostId(worktree) ?? (repo && getRepoExecutionHostId(repo)),
    hostOptions,
    hostFilterActive
  )

  // Why: a branch named like its workspace would read "main · main".
  const showBranch = branch.trim().length > 0 && branch !== worktreeLabel
  const showRepo = repoName.length > 0 && repoName !== worktreeLabel

  return (
    <CommandItem
      value={renderKey}
      onSelect={() => handleSelectItem(entry)}
      data-current={isCurrentWorktree ? 'true' : undefined}
      density="palette"
    >
      <div className="flex h-5 w-4 shrink-0 items-center justify-center">
        <PaletteWorktreeStatusDot worktree={worktree} />
      </div>
      <div className="min-w-0 flex-1">
        <PaletteRowBody
          primary={
            <>
              {sshConnectionId && (
                <span
                  aria-label={
                    isSshDisconnected
                      ? translate(
                          'auto.components.WorktreeJumpPalette.63c2be1914',
                          'SSH disconnected'
                        )
                      : translate('auto.components.WorktreeJumpPalette.34c8fbb46e', 'SSH remote')
                  }
                  className="inline-flex shrink-0 items-center"
                >
                  {isSshDisconnected ? (
                    <ServerOff className="size-3.5 text-red-400" aria-hidden="true" />
                  ) : (
                    <Server className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
              )}
              <span className="truncate text-[13px] text-foreground">
                <HighlightedText text={worktreeLabel} matchRanges={entry.match.displayNameRanges} />
              </span>
              {isCurrentWorktree && (
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  {translate('auto.components.WorktreeJumpPalette.556e7232ca', 'Current')}
                </span>
              )}
              {worktree.isMainWorktree && (
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  {translate('auto.components.WorktreeJumpPalette.739bda980c', 'primary')}
                </span>
              )}
              {showBranch ? (
                <span className="truncate text-[12px] text-muted-foreground">
                  <HighlightedText text={branch} matchRanges={entry.match.branchRanges} />
                </span>
              ) : null}
            </>
          }
          context={
            showRepo ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                <RepoBadgeMark color={repo?.badgeColor} />
                <span className="truncate">
                  <HighlightedText text={repoName} matchRanges={entry.match.repoRanges} />
                </span>
              </span>
            ) : null
          }
          badges={<PaletteHostBadgeChip badge={hostBadge} />}
          trailing={
            <PaletteRowTrailing
              sessionAge={sessionAge}
              modifierKeys={controller.digitShortcutModifiers}
              showShortcut={false}
            />
          }
        />
        {entry.match.supportingText && (
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] leading-5 text-muted-foreground">
            <span className="inline-flex h-[18px] shrink-0 items-center rounded border border-border bg-foreground/[0.04] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {getPaletteSupportingTextLabel(entry.match.supportingText.labelKind)}
            </span>
            <span className="truncate">
              <HighlightedText
                text={entry.match.supportingText.text}
                matchRanges={entry.match.supportingText.matchRanges}
              />
            </span>
          </div>
        )}
      </div>
    </CommandItem>
  )
}
