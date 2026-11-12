import type React from 'react'
import { translate } from '@/i18n/i18n'
import { PaletteRowShortcutBadge } from './worktree-jump-palette-primitives'

/** Time since last activity, or the number shortcut while its modifier is held. */
export function PaletteRowTrailing({
  sessionAge,
  shortcutIndex,
  modifierKeys,
  showShortcut
}: {
  sessionAge?: string | null
  shortcutIndex?: number
  modifierKeys: readonly string[]
  showShortcut: boolean
}): React.JSX.Element | null {
  if (showShortcut && shortcutIndex !== undefined) {
    return <PaletteRowShortcutBadge index={shortcutIndex} modifierKeys={modifierKeys} />
  }
  if (!sessionAge) {
    return null
  }
  return (
    <span
      aria-label={translate(
        'auto.components.WorktreeJumpPalette.lastActiveTime',
        'Last active {{value0}} ago',
        { value0: sessionAge }
      )}
      className="shrink-0 text-[12px] tabular-nums text-muted-foreground"
    >
      {sessionAge}
    </span>
  )
}

/** Title, then where it lives, then time: one line, with an optional peek line under the selected row. */
export function PaletteRowBody({
  primary,
  context,
  badges,
  trailing,
  peek
}: {
  primary: React.ReactNode
  context: React.ReactNode
  badges?: React.ReactNode
  trailing: React.ReactNode
  peek?: string | null
}): React.JSX.Element {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex h-5 min-w-0 items-center gap-2.5">
        <div className="flex min-w-0 shrink items-center gap-2 overflow-hidden">{primary}</div>
        <div className="flex min-w-16 flex-1 items-center overflow-hidden">{context}</div>
        {badges}
        {trailing}
      </div>
      {peek ? (
        <p data-slot="palette-row-peek" className="mt-0.5 truncate text-[12px] text-foreground/80">
          {peek}
        </p>
      ) : null}
    </div>
  )
}

/** Quiet "current" marker for an open tab row; one label, never both. */
export function PaletteCurrentTabLabel({
  result
}: {
  result: { isCurrentTab: boolean; isCurrentWorktree: boolean }
}): React.JSX.Element | null {
  if (!result.isCurrentTab && !result.isCurrentWorktree) {
    return null
  }
  return (
    <span className="shrink-0 text-[12px] text-muted-foreground">
      {result.isCurrentTab
        ? translate('auto.components.WorktreeJumpPalette.52404f8096', 'Current Tab')
        : translate('auto.components.WorktreeJumpPalette.c5081f2814', 'Current Worktree')}
    </span>
  )
}
