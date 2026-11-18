import type React from 'react'
import { createContext, useContext, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../../store/index'
import type { SettingsSearchEntry } from '../search/settings-search'
import { matchesSettingsSearch } from '../search/settings-search'

export type SettingsSectionLayout = {
  /** Sections of the tab on screen; a tab can stack several. */
  visibleSectionIds: ReadonlySet<string>
  /** 'page': the section is the whole page. 'tab': it fills a tab that already names it. 'stacked': one of several. */
  headerStyle: 'page' | 'tab' | 'stacked'
  /** The sidebar entry's name, shown in place of the section's own on a page. */
  pageTitle?: string
}

// Share the layout through context to avoid threading it through every section call.
const SettingsSectionLayoutContext = createContext<SettingsSectionLayout | null>(null)

export const SettingsSectionLayoutProvider = SettingsSectionLayoutContext.Provider

/** Shows one section as the whole page. */
export function ActiveSettingsSectionProvider({
  value,
  children
}: {
  value: string | null
  children: React.ReactNode
}): React.JSX.Element {
  const layout = useMemo<SettingsSectionLayout>(
    () => ({ visibleSectionIds: new Set(value === null ? [] : [value]), headerStyle: 'page' }),
    [value]
  )
  return <SettingsSectionLayoutProvider value={layout}>{children}</SettingsSectionLayoutProvider>
}

type SettingsSectionProps = {
  id: string
  title: string
  description: React.ReactNode
  searchEntries?: SettingsSearchEntry[]
  children?: React.ReactNode
  className?: string
  bodyClassName?: string
  badge?: string
  badgeAccessory?: React.ReactNode
  forceVisible?: boolean
  /** Mount only the selected section, even when search lists several matches. */
  isActive?: boolean
  /** Header-scoped actions, such as Import from Ghostty. */
  headerAction?: React.ReactNode
  /** Drops the title block while the body shows its own header (a plugin's page, a subsection's heading). */
  hideHeader?: boolean
  /** Click handler on the section title — the hook for hidden staff
   *  affordances (Option-click reveals), mirroring the Updates header. */
  onTitleClick?: (event: React.MouseEvent<HTMLHeadingElement>) => void
}

export function SettingsSection({
  id,
  title,
  description,
  searchEntries,
  children,
  className,
  bodyClassName,
  badge,
  badgeAccessory,
  forceVisible = false,
  isActive,
  headerAction,
  hideHeader = false,
  onTitleClick
}: SettingsSectionProps): React.JSX.Element | null {
  const query = useAppStore((state) => state.settingsSearchQuery)
  const layout = useContext(SettingsSectionLayoutContext)
  const sectionIsActive = isActive ?? layout?.visibleSectionIds.has(id) ?? false
  const hasQuery = query.trim() !== ''
  const matchesQuery = !searchEntries || matchesSettingsSearch(query, searchEntries)
  if (!forceVisible) {
    if (hasQuery) {
      if (!sectionIsActive || !matchesQuery) {
        return null
      }
    } else if (!sectionIsActive) {
      return null
    }
  }

  const headerStyle = layout?.headerStyle ?? 'page'
  const isPage = headerStyle === 'page'
  // Why keep a clickable title: Option-click on it reveals staff controls.
  const titleIsRedundant = headerStyle === 'tab' && !onTitleClick
  return (
    <section
      id={id}
      data-settings-section={id}
      className={cn('scroll-mt-8', isPage ? 'space-y-5' : 'space-y-4', className)}
    >
      <div hidden={hideHeader} className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            className={cn(
              'flex flex-wrap items-center gap-2 font-semibold text-foreground',
              isPage ? 'text-base leading-tight' : 'text-sm'
            )}
            onClick={onTitleClick}
          >
            <span className={titleIsRedundant ? 'sr-only' : undefined}>
              {(isPage ? layout?.pageTitle : undefined) ?? title}
            </span>
            {badge ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-3xs font-medium uppercase tracking-wider text-muted-foreground">
                {badge}
              </span>
            ) : null}
            {badgeAccessory}
          </h2>
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {/* Why no frame: rows sit on the page; a card around a whole section nests cards inside it. */}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
