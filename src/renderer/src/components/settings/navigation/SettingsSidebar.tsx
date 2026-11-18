import type { RefObject } from 'react'
import { useMemo } from 'react'
import { ArrowLeft, Search, Server } from 'lucide-react'
import type { RepoIcon } from '../../../../../shared/repo-icon'
import type { GitHubRepositoryIdentity } from '../../../../../shared/github/pull-request-types'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { useShortcutKeyComboDetails } from '@/hooks/useShortcutLabel'
import { ShortcutKeyCombo } from '../../ShortcutKeyCombo'
import { cn } from '@/lib/utils'
import { RepoIconGlyph } from '../../repo/repo-icon'
import { RepoForkIndicator } from '../../repo/repo-fork-indicator'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { translate } from '@/i18n/i18n'
import { resolveLeftSidebarStyleVariables } from '@/lib/left-sidebar-appearance'
import { useAppStore } from '@/store/index'
import type { SettingsPresentation } from '../page/settings-render-context'

/** One sidebar entry: a destination, or a project. */
export type SettingsRailItem = {
  id: string
  title: string
  /** Section the entry opens. */
  sectionId: string
  isActive: boolean
  needsAttention: boolean
}

export type SettingsRailGroup = {
  id: string
  title: string
  items: SettingsRailItem[]
}

export type SettingsRailProject = SettingsRailItem & {
  badgeColor?: string
  isRemote?: boolean
  repoIcon?: RepoIcon | null
  upstream?: GitHubRepositoryIdentity | null
}

type SettingsSidebarProps = {
  presentation: SettingsPresentation
  settings: GlobalSettings | null
  /** Entries above the first group, such as Overview. */
  leadingItems: SettingsRailItem[]
  groups: SettingsRailGroup[]
  projects: SettingsRailProject[]
  searchInputRef?: RefObject<HTMLInputElement | null>
  searchAutoFocus?: boolean
  onBack: () => void
  onSelectSection: (sectionId: string) => void
}

function SettingsSearchField({
  searchInputRef,
  searchAutoFocus = false
}: Pick<SettingsSidebarProps, 'searchInputRef' | 'searchAutoFocus'>): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchInputQuery)
  const onSearchChange = useAppStore((state) => state.setSettingsSearchQuery)
  const searchShortcutCombos = useShortcutKeyComboDetails('settings.search')

  return (
    <div className="px-3 pt-3 pb-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          data-settings-search-input=""
          autoFocus={searchAutoFocus}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={translate(
            'auto.components.settings.SettingsSidebar.dbceaa8840',
            'Search settings'
          )}
          className="bg-background/60 pl-9 pr-14 text-[13px]"
        />
        {searchQuery === '' ? (
          <span className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
            {searchShortcutCombos.map((combo) => (
              <ShortcutKeyCombo
                key={combo.keys.join('-')}
                keys={combo.keys}
                doubleTap={combo.doubleTap}
                className="inline-flex gap-0.5"
                separatorClassName="text-3xs text-muted-foreground"
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function railItemClassName(isActive: boolean): string {
  return cn(
    'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] outline-none transition-colors duration-150 focus-visible:ring-[3px] focus-visible:ring-worktree-sidebar-ring/50',
    isActive
      ? 'bg-worktree-sidebar-accent font-medium text-worktree-sidebar-accent-foreground'
      : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-accent/60 hover:text-worktree-sidebar-foreground'
  )
}

/** Says a destination has something waiting, in words for screen readers and a dot for the eye. */
export function SettingsAttentionDot({ className }: { className?: string }): React.JSX.Element {
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-status-warning" />
      <span className="sr-only">
        {translate('settings.destinations.needsAttention', 'Needs attention')}
      </span>
    </span>
  )
}

function SettingsRailButton({
  item,
  onSelectSection,
  leading,
  trailing
}: {
  item: SettingsRailItem
  onSelectSection: (sectionId: string) => void
  leading?: React.ReactNode
  trailing?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-current={item.isActive ? 'page' : undefined}
      data-current={item.isActive ? 'true' : undefined}
      data-settings-destination={item.id}
      onClick={() => onSelectSection(item.sectionId)}
      className={railItemClassName(item.isActive)}
    >
      {leading}
      <span className="truncate">{item.title}</span>
      {trailing}
      {item.needsAttention ? <SettingsAttentionDot className="ml-auto" /> : null}
    </button>
  )
}

const GROUP_LABEL_CLASS_NAME =
  'px-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground'

export function SettingsSidebar({
  presentation,
  settings,
  leadingItems,
  groups,
  projects,
  searchInputRef,
  searchAutoFocus = false,
  onBack,
  onSelectSection
}: SettingsSidebarProps): React.JSX.Element {
  const leftSidebarStyle = useMemo(() => resolveLeftSidebarStyleVariables(settings), [settings])

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r',
        // Why: beside the app sidebar a second sidebar-colored column reads as one wide sidebar, so a tab's list sits on the tab's own surface.
        presentation === 'tab'
          ? 'w-[232px] border-border bg-background @max-[760px]/settings:w-[176px]'
          : 'w-[280px] border-worktree-sidebar-border bg-worktree-sidebar'
      )}
      style={presentation === 'tab' ? undefined : leftSidebarStyle}
    >
      {/* A tab closes from its own strip, so only the page needs a way back. */}
      {presentation === 'page' ? (
        <div className="border-b border-worktree-sidebar-border px-3 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="w-full justify-start gap-2 text-[13px] text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            {translate('auto.components.settings.SettingsSidebar.60f8a673a7', 'Back to app')}
          </Button>
        </div>
      ) : null}

      <SettingsSearchField searchInputRef={searchInputRef} searchAutoFocus={searchAutoFocus} />

      <nav
        aria-label={translate('settings.destinations.navLabel', 'Settings sections')}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-3 py-3"
      >
        <div className="space-y-4">
          {leadingItems.length > 0 ? (
            <div className="space-y-0.5">
              {leadingItems.map((item) => (
                <SettingsRailButton key={item.id} item={item} onSelectSection={onSelectSection} />
              ))}
            </div>
          ) : null}

          {groups.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <p className={GROUP_LABEL_CLASS_NAME}>{group.title}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SettingsRailButton key={item.id} item={item} onSelectSection={onSelectSection} />
                ))}
              </div>
            </div>
          ))}

          <div className="space-y-1.5">
            <p className={GROUP_LABEL_CLASS_NAME}>
              {translate('auto.components.settings.SettingsSidebar.5c9669ff9c', 'Projects')}
            </p>

            {projects.length > 0 ? (
              <div className="space-y-0.5">
                {projects.map((project) => (
                  <SettingsRailButton
                    key={project.id}
                    item={project}
                    onSelectSection={onSelectSection}
                    leading={
                      <RepoIconGlyph
                        repoIcon={project.repoIcon}
                        color={project.badgeColor}
                        className="size-4 shrink-0 text-muted-foreground"
                        iconClassName="size-3.5"
                      />
                    }
                    trailing={
                      <>
                        <RepoForkIndicator upstream={project.upstream} />
                        {project.isRemote ? (
                          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-3xs text-muted-foreground">
                            <Server className="size-3" />
                            {translate(
                              'auto.components.settings.SettingsSidebar.e0900f83e7',
                              'SSH'
                            )}
                          </span>
                        ) : null}
                      </>
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.SettingsSidebar.df38d612b7',
                  'No projects added yet.'
                )}
              </p>
            )}
          </div>
        </div>
      </nav>
    </aside>
  )
}
