import { SettingsTabBar } from '../section-layout/SettingsTabBar'
import { SettingsAttentionDot } from './SettingsSidebar'
import type { SettingsDestination } from './settings-destinations'

/** The page header for a sidebar entry that holds several sections: its name, summary and tabs. */
export function SettingsDestinationHeader({
  destination,
  activeTabId,
  tabIdsNeedingAttention,
  onSelectTab
}: {
  destination: SettingsDestination
  activeTabId: string
  tabIdsNeedingAttention: ReadonlySet<string>
  onSelectTab: (tabId: string) => void
}): React.JSX.Element {
  return (
    <header className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-base font-semibold leading-tight text-foreground">
          {destination.title}
        </h1>
        <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
          {destination.description}
        </p>
      </div>
      {destination.tabs.length > 1 ? (
        <SettingsTabBar
          label={destination.title}
          tabs={destination.tabs.map((tab) => ({
            id: tab.id,
            title: tab.title,
            accessory: tabIdsNeedingAttention.has(tab.id) ? <SettingsAttentionDot /> : undefined
          }))}
          activeTabId={activeTabId}
          onSelectTab={onSelectTab}
        />
      ) : null}
    </header>
  )
}
