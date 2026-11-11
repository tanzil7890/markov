import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { Label } from '../../ui/label'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { SettingsSwitch } from '../form-controls/SettingsFormControls'
import { getChatConnectorsExperimentalSearchEntry } from './chat-connectors-experimental-search'

export function ChatConnectorsExperimentalSetting({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const entry = getChatConnectorsExperimentalSearchEntry()
  const enabled = settings.experimentalConnectors === true
  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
      className="flex items-start justify-between gap-4 py-2"
      id="chat-connectors"
    >
      <div className="min-w-0 shrink space-y-0.5">
        <Label>{entry.title}</Label>
        <p className="text-xs text-muted-foreground">{entry.description}</p>
      </div>
      <SettingsSwitch
        checked={enabled}
        ariaLabel={translate(
          'auto.components.settings.chatConnectorsExperimental.toggleLabel',
          'Toggle chat connectors'
        )}
        onChange={() => updateSettings({ experimentalConnectors: !enabled })}
      />
    </SearchableSetting>
  )
}
