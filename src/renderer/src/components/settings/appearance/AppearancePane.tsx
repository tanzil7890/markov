import type React from 'react'

import type { GlobalSettings } from '../../../../../shared/global-settings-types'

import { AppearanceInterfaceSection } from './AppearanceInterfaceSection'
import { AppearanceWindowSidebarSection } from './AppearanceWindowSidebarSection'
import { SearchableSetting } from '../section-layout/SearchableSetting'
import { matchesSettingsSearch } from '../search/settings-search'
import { useAppStore } from '../../../store/index'
import { getAppIconEntries } from './appearance-search'
import type { AppearancePart } from './appearance-part-search'
import { TerminalAppearanceSection } from '../terminal/appearance/TerminalAppearanceSection'
import type { UseTerminalConfigImportReturn } from '../terminal/configuration/useTerminalConfigImport'
import type { UseWarpThemeImportReturn } from '../terminal/themes/useWarpThemeImport'
import { AppIconSelector } from './AppIconSelector'
import { normalizeAppIconId } from '../../../../../shared/app-icon'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'
import { translate } from '@/i18n/i18n'

type AppearancePaneProps = {
  /** Which of the three Appearance sections to show. */
  part: AppearancePart
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  applyTheme: (theme: 'system' | 'dark' | 'light') => void
  fontSuggestions: string[]
  terminalFontSuggestions: string[]
  onRequestFontSuggestions?: () => void
  systemPrefersDark: boolean
  terminalConfigImport: UseTerminalConfigImportReturn
  warpThemes: UseWarpThemeImportReturn
}

export function AppearancePane({
  part,
  settings,
  updateSettings,
  applyTheme,
  fontSuggestions,
  terminalFontSuggestions,
  onRequestFontSuggestions,
  systemPrefersDark,
  terminalConfigImport,
  warpThemes
}: AppearancePaneProps): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  if (part === 'terminal') {
    return (
      <TerminalAppearanceSection
        settings={settings}
        updateSettings={updateSettings}
        systemPrefersDark={systemPrefersDark}
        terminalFontSuggestions={terminalFontSuggestions}
        onRequestFontSuggestions={onRequestFontSuggestions}
        terminalConfigImport={terminalConfigImport}
        warpThemes={warpThemes}
        forceVisiblePrimary={false}
      />
    )
  }
  if (part === 'window') {
    return (
      <AppearanceWindowSidebarSection
        settings={settings}
        updateSettings={updateSettings}
        forceVisiblePrimary={false}
      />
    )
  }

  const isWebClient = isWebClientLocation()
  // Windows web clients have no local system tray; require desktop Electron.
  const isDesktopWindows = getRendererAppPlatform() === 'win32' && !isWebClient
  const isDesktopMac = getRendererAppPlatform() === 'darwin' && !isWebClient
  const appIconEntries = getAppIconEntries()
  return (
    <div className="space-y-6">
      <AppearanceInterfaceSection
        settings={settings}
        updateSettings={updateSettings}
        applyTheme={applyTheme}
        fontSuggestions={fontSuggestions}
        onRequestFontSuggestions={onRequestFontSuggestions}
        isDesktopMac={isDesktopMac}
        isDesktopWindows={isDesktopWindows}
        forceVisiblePrimary={false}
      />

      {/* Keep the App Icon easter egg at the bottom instead of inside the advanced controls. */}
      {matchesSettingsSearch(searchQuery, appIconEntries) ? (
        <SearchableSetting
          title={translate('auto.components.settings.AppearancePane.ca1590d42f', 'App Icon')}
          description={translate(
            'auto.components.settings.AppearancePane.0cd9b8228f',
            'Choose the app icon shown in the Dock and window switcher.'
          )}
          keywords={appIconEntries.flatMap((entry) => [
            entry.title,
            entry.description ?? '',
            ...(entry.keywords ?? [])
          ])}
          className="max-w-none"
        >
          <AppIconSelector
            value={normalizeAppIconId(settings.appIcon)}
            onChange={(appIcon) => updateSettings({ appIcon })}
          />
        </SearchableSetting>
      ) : null}
    </div>
  )
}
