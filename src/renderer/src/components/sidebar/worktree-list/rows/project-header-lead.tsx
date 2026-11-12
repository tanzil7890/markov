import React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../../../shared/repo-types'
import { isFolderRepo } from '../../../../../../shared/repo-kind'
import { DEFAULT_REPO_BADGE_COLOR } from '../../../../../../shared/constants'
import { handleRepoHeaderCollapseAffordancePointerDown } from './header-event-guards'

/** The default folder glyph gives way to the chevron; an icon or colour the user picked stays. */
export function hasChosenRepoGlyph(
  repo: Repo | undefined,
  headerColor: string | undefined
): boolean {
  return Boolean(repo?.repoIcon || (headerColor && headerColor !== DEFAULT_REPO_BADGE_COLOR))
}

export function HeaderChevron({
  collapsed,
  onToggle
}: {
  collapsed: boolean
  onToggle: (event: React.MouseEvent) => void
}): React.JSX.Element {
  return (
    <div
      className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
      data-repo-header-collapse-affordance=""
      aria-hidden
      onPointerDown={handleRepoHeaderCollapseAffordancePointerDown}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle(event)
      }}
    >
      <ChevronDown className={cn('size-3.5 transition-transform', collapsed && '-rotate-90')} />
    </div>
  )
}

/** What kind of project this is, or how many workspaces it holds. */
export function HeaderMeta({ repo, count }: { repo: Repo; count: number }): React.JSX.Element {
  return (
    <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
      {isFolderRepo(repo)
        ? translate('components.native-chat.composerWorkspace.folder', 'Folder')
        : count}
    </span>
  )
}
