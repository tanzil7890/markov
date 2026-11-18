import { translate } from '@/i18n/i18n'

export type SettingsSearchResult = {
  key: string
  title: string
  description?: string
  /** Where the setting lives, as the sidebar names it. */
  path: string
  sectionId: string
  /** Anchor of the setting inside its section, when it has one. */
  targetId?: string
  isSection: boolean
}

export function SettingsSearchResults({
  query,
  results,
  onOpen
}: {
  query: string
  results: readonly SettingsSearchResult[]
  onOpen: (result: SettingsSearchResult) => void
}): React.JSX.Element {
  if (results.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {translate(
          'auto.components.settings.Settings.noSettingsFoundForQuery',
          'No settings found for "{{value0}}"',
          { value0: query }
        )}
      </p>
    )
  }
  return (
    <section
      aria-label={translate('settings.search.resultsLabel', 'Search results')}
      className="space-y-3"
    >
      <h2 className="text-base font-semibold leading-tight text-foreground">
        {translate('settings.search.resultsTitle', 'Results for "{{query}}"', { query })}
      </h2>
      <ul className="-mx-3">
        {results.map((result) => (
          <li key={result.key}>
            <button
              type="button"
              data-settings-search-result={result.sectionId}
              onClick={() => onOpen(result)}
              className="flex w-full items-center gap-4 rounded-md px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {result.title}
                </span>
                {result.description ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {result.description}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{result.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
