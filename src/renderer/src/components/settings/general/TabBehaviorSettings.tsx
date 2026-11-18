import type React from 'react'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { RecentTabOrderControl } from '../appearance/RecentTabOrderControl'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { SettingsSwitchRow } from '../form-controls/SettingsFormControls'
import { getGeneralNavigationSearchEntries } from './general-search'
import { translate } from '@/i18n/i18n'

/** Tab order, preview tabs, and the confirmations shown before a tab closes. */
export function TabBehaviorSettings({
  settings,
  updateSettings
}: {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const tabOrderEntry = getGeneralNavigationSearchEntries()[0]
  return (
    <div className="space-y-4">
      <RecentTabOrderControl
        ctrlTabOrderMode={settings.ctrlTabOrderMode ?? 'mru'}
        keywords={
          tabOrderEntry
            ? [
                tabOrderEntry.title,
                tabOrderEntry.description ?? '',
                ...(tabOrderEntry.keywords ?? [])
              ]
            : []
        }
        updateSettings={updateSettings}
      />
      <SearchableSetting
        title={translate(
          'auto.components.settings.GeneralPane.editor_preview_tabs',
          'Reuse a preview tab when browsing files'
        )}
        description={translate(
          'auto.components.settings.GeneralPane.editor_preview_tabs_description',
          'Single-clicking a file in the Explorer, or following a link in Markdown source, reuses one italic preview tab per group instead of opening a new one. Editing, double-clicking, or pinning keeps that tab open. Turn this off to give every file its own tab.'
        )}
        keywords={['preview', 'tab', 'editor', 'explorer', 'reuse', 'replace', 'italic']}
      >
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.GeneralPane.editor_preview_tabs',
            'Reuse a preview tab when browsing files'
          )}
          description={translate(
            'auto.components.settings.GeneralPane.editor_preview_tabs_description',
            'Single-clicking a file in the Explorer, or following a link in Markdown source, reuses one italic preview tab per group instead of opening a new one. Editing, double-clicking, or pinning keeps that tab open. Turn this off to give every file its own tab.'
          )}
          checked={settings.editorPreviewTabsEnabled ?? true}
          onChange={() =>
            updateSettings({
              editorPreviewTabsEnabled: !(settings.editorPreviewTabsEnabled ?? true)
            })
          }
        />
      </SearchableSetting>
      <SearchableSetting
        title={translate(
          'auto.components.settings.GeneralPane.5cb5475664',
          'Confirm before closing pinned tabs'
        )}
        description={translate(
          'auto.components.settings.GeneralPane.36b2a5dc6d',
          'Show a confirmation dialog before a pinned tab is closed.'
        )}
        keywords={['pinned', 'tab', 'confirm', 'close']}
      >
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.GeneralPane.5cb5475664',
            'Confirm before closing pinned tabs'
          )}
          description={translate(
            'auto.components.settings.GeneralPane.36b2a5dc6d',
            'Show a confirmation dialog before a pinned tab is closed.'
          )}
          checked={settings.confirmClosePinnedTab ?? true}
          onChange={() =>
            updateSettings({ confirmClosePinnedTab: !(settings.confirmClosePinnedTab ?? true) })
          }
        />
      </SearchableSetting>
      <SearchableSetting
        title={translate(
          'auto.components.settings.GeneralPane.confirm_running_work_close',
          'Confirm before closing active chats or terminals'
        )}
        description={translate(
          'auto.components.settings.GeneralPane.confirm_running_work_close_description',
          'Ask before stopping an active agent or command when closing its chat or terminal.'
        )}
        keywords={['chat', 'terminal', 'agent', 'command', 'confirm', 'close', 'OMP']}
      >
        <SettingsSwitchRow
          label={translate(
            'auto.components.settings.GeneralPane.confirm_running_work_close',
            'Confirm before closing active chats or terminals'
          )}
          description={translate(
            'auto.components.settings.GeneralPane.confirm_running_work_close_description',
            'Ask before stopping an active agent or command when closing its chat or terminal.'
          )}
          checked={!settings.skipCloseTerminalWithRunningProcessConfirm}
          onChange={() =>
            updateSettings({
              skipCloseTerminalWithRunningProcessConfirm:
                !settings.skipCloseTerminalWithRunningProcessConfirm
            })
          }
        />
      </SearchableSetting>
    </div>
  )
}
