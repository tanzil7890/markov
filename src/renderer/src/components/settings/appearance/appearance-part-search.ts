import { SHOW_UI_LANGUAGE_SETTING } from '@/i18n/supported-languages'
import type { SettingsSearchEntry } from '../search/settings-search'
import { getTerminalAppearanceSearchEntries } from '../terminal/terminal-search'
import {
  getAppIconEntries,
  getCodeEditorThemeEntries,
  getLanguageEntries,
  getLayoutEntries,
  getStatusBarEntries,
  getThemeEntries,
  getTitlebarEntries,
  getTypographyEntries,
  getZoomEntries
} from './appearance-search'
import { getReduceVisualEffectsEntries } from './appearance-reduce-visual-effects-search'
import { getSidebarEntries } from './appearance-sidebar-search'
import { getMenuBarIconEntries, getSystemTrayEntries } from './appearance-system-presence-search'

/** Appearance is three sections: the app itself, the terminal, and the window chrome around them. */
export type AppearancePart = 'interface' | 'terminal' | 'window'

type AppearancePartSearchOptions = {
  showDesktopThemeImports?: boolean
  showSystemTray?: boolean
  showMenuBarIcon?: boolean
}

export function getAppearancePartSearchEntries(
  part: AppearancePart,
  options: AppearancePartSearchOptions = {}
): SettingsSearchEntry[] {
  if (part === 'terminal') {
    return getTerminalAppearanceSearchEntries(options)
  }
  if (part === 'window') {
    return [...getStatusBarEntries(), ...getSidebarEntries(), ...getLayoutEntries()]
  }
  return [
    ...getThemeEntries(),
    ...getCodeEditorThemeEntries(),
    ...getZoomEntries(),
    ...getTypographyEntries(),
    ...(SHOW_UI_LANGUAGE_SETTING ? getLanguageEntries() : []),
    ...getTitlebarEntries(),
    ...getReduceVisualEffectsEntries(),
    ...getSystemTrayEntries(options),
    ...getMenuBarIconEntries(options),
    ...getAppIconEntries()
  ]
}
