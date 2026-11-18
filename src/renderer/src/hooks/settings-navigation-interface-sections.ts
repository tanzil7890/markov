import { getAppearancePartSearchEntries } from '@/components/settings/appearance/appearance-part-search'
import { getChatAppearanceSearchEntries } from '@/components/settings/appearance/chat/chat-appearance-search'
import { getChatBehaviorSearchEntries } from '@/components/settings/chat/chat-behavior-search'
import { getChatNamingSearchEntry } from '@/components/settings/chat/chat-naming-search'
import { getChatInlineVisualsSearchEntry } from '@/components/settings/chat/chat-inline-visuals-search'
import { getChatLaunchSearchEntries } from '@/components/settings/chat/chat-launch-search'
import { getChatPermissionSearchEntry } from '@/components/settings/chat/chat-permission-search'
import { getInputPaneSearchEntries } from '@/components/settings/input/input-search'
import { getNotificationsPaneSearchEntries } from '@/components/settings/notifications/notifications-search'
import { getShortcutsPaneSearchEntries } from '@/components/settings/shortcuts/shortcuts-search'
import { getStatsPaneSearchEntries } from '@/components/stats/stats-search'
import { translate } from '@/i18n/i18n'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import {
  BarChart3,
  Bell,
  Keyboard,
  MessageSquare,
  Palette,
  PanelLeft,
  SquareTerminal,
  TextCursorInput
} from 'lucide-react'
import type { SettingsNavigationBuildOptions } from './settings-navigation-build-options'

export function buildInterfaceSettingsSections({
  isMac,
  isWindows,
  isWebClient,
  hostQueuesMessages,
  typedChatPermissions,
  managedBrowserCreationEnabled,
  mobileEmulatorCreationEnabled
}: SettingsNavigationBuildOptions): SettingsNavSection[] {
  const showDesktopOnlySettings = !isWebClient
  const appearanceSearchOptions = {
    showDesktopThemeImports: showDesktopOnlySettings,
    showSystemTray: showDesktopOnlySettings && isWindows,
    showMenuBarIcon: showDesktopOnlySettings && isMac
  }
  return [
    {
      id: 'appearance',
      title: translate('auto.hooks.useSettingsNavigationMetadata.93d88d20bf', 'Appearance'),
      description: translate(
        'settings.sections.appearance.description',
        'Theme, zoom, fonts, language, and the window title bar.'
      ),
      icon: Palette,
      searchEntries: getAppearancePartSearchEntries('interface', appearanceSearchOptions)
    },
    {
      id: 'appearance-terminal',
      title: translate('settings.sections.appearanceTerminal.title', 'Terminal appearance'),
      description: translate(
        'settings.sections.appearanceTerminal.description',
        'Terminal fonts, themes, cursor, and pane colors.'
      ),
      icon: SquareTerminal,
      searchEntries: getAppearancePartSearchEntries('terminal', appearanceSearchOptions)
    },
    {
      id: 'appearance-window',
      title: translate('settings.sections.appearanceWindow.title', 'Sidebar & status bar'),
      description: translate(
        'settings.sections.appearanceWindow.description',
        'What the sidebar, status bar, and file explorer show.'
      ),
      icon: PanelLeft,
      searchEntries: getAppearancePartSearchEntries('window', appearanceSearchOptions)
    },
    {
      id: 'chat',
      title: translate('settings.appearance.chat.title', 'Chat UI'),
      description: translate('settings.chat.description', 'Choose how chats look and behave.'),
      icon: MessageSquare,
      searchEntries: [
        ...(showDesktopOnlySettings ? getChatLaunchSearchEntries() : []),
        getChatPermissionSearchEntry(typedChatPermissions),
        ...getChatAppearanceSearchEntries(),
        ...getChatBehaviorSearchEntries().filter(
          (entry) => hostQueuesMessages || entry.targetSectionId !== 'chat-queue-follow-ups'
        ),
        ...(showDesktopOnlySettings
          ? [getChatNamingSearchEntry(), getChatInlineVisualsSearchEntry()]
          : [])
      ]
    },
    {
      id: 'input',
      title: translate('auto.hooks.useSettingsNavigationMetadata.0c6ee88a5f', 'Input & Editing'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.1f452cbd4c',
        'Selection and editing behavior.'
      ),
      icon: TextCursorInput,
      searchEntries: getInputPaneSearchEntries()
    },
    ...(showDesktopOnlySettings
      ? [
          {
            id: 'notifications',
            title: translate(
              'auto.hooks.useSettingsNavigationMetadata.2eece16ad1',
              'Notifications'
            ),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.7682607591',
              'Native desktop notifications for agent and terminal events.'
            ),
            icon: Bell,
            searchEntries: getNotificationsPaneSearchEntries()
          }
        ]
      : []),
    {
      id: 'shortcuts',
      title: translate('auto.hooks.useSettingsNavigationMetadata.94295ebfb3', 'Shortcuts'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.dcd0d9b74f',
        'Keyboard shortcuts for common actions.'
      ),
      icon: Keyboard,
      searchEntries: getShortcutsPaneSearchEntries({
        includeManagedBrowser: managedBrowserCreationEnabled,
        includeMobileEmulator: mobileEmulatorCreationEnabled
      })
    },
    {
      id: 'stats',
      title: translate('auto.hooks.useSettingsNavigationMetadata.d72a58b5b9', 'Stats & Usage'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.b351014180',
        'Markov stats plus Claude, Codex, OpenCode, Muse token analytics and Grok subscription usage.'
      ),
      icon: BarChart3,
      searchEntries: getStatsPaneSearchEntries()
    }
  ]
}
