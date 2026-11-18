import { Tabs, TabsList, TabsTrigger } from '../../ui/tabs'

export type SettingsTabBarItem = {
  id: string
  title: string
  /** Shown after the title, such as a mark for a tab that needs attention. */
  accessory?: React.ReactNode
}

/** The row of tabs under a Settings page header, and inside a pane that is long enough to need its own. */
export function SettingsTabBar({
  label,
  tabs,
  activeTabId,
  onSelectTab
}: {
  label: string
  tabs: readonly SettingsTabBarItem[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
}): React.JSX.Element {
  return (
    <div className="border-b border-border/60">
      <Tabs value={activeTabId} onValueChange={onSelectTab}>
        <TabsList variant="line" aria-label={label}>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} data-settings-tab={tab.id}>
              {tab.title}
              {tab.accessory}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
