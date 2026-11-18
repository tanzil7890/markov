import { CliSection } from '../cli/install/CliSection'
import { GeneralEditorSettingsSection } from '../editor/GeneralEditorSettingsSection'
import { GeneralSupportSection } from '../general/GeneralSupportSection'
import { TabBehaviorSettings } from '../general/TabBehaviorSettings'
import { SettingsOverviewPane } from '../overview/SettingsOverviewPane'
import { SettingsSection } from '../section-layout/SettingsSection'
import { GeneralUpdateSettingsSection } from '../updates/GeneralUpdateSettingsSection'
import { translate } from '@/i18n/i18n'
import type { SettingsRenderContext } from './settings-render-context'

function desktopPlatformFromUserAgent(userAgent: string): 'darwin' | 'win32' | 'other' {
  if (userAgent.includes('Mac')) {
    return 'darwin'
  }
  return userAgent.includes('Windows') ? 'win32' : 'other'
}

export function renderOverviewSettingsSection(context: SettingsRenderContext): React.JSX.Element {
  const { model, actions, navigation, view } = context
  return (
    <SettingsSection
      id="overview"
      title={translate('settings.destinations.overview.title', 'Overview')}
      description={translate(
        'settings.sections.overview.description',
        'What needs your attention, and the settings people change most.'
      )}
      searchEntries={navigation.getSectionSearchEntries('overview')}
      // The page header above already says what this is.
      hideHeader
    >
      {view.isSectionMounted('overview') ? (
        <SettingsOverviewPane
          settings={model.settings}
          attentionItems={view.attentionItems}
          showNotifications={navigation.navSectionIds.has('notifications')}
          onOpenSection={(sectionId) => void actions.scrollToSection(sectionId)}
        />
      ) : null}
    </SettingsSection>
  )
}

export function renderTabsSettingsSection(context: SettingsRenderContext): React.JSX.Element {
  const { model, navigation, view } = context
  return (
    <SettingsSection
      id="tabs"
      title={translate('settings.sections.tabs.title', 'Tabs')}
      description={translate(
        'settings.sections.tabs.description',
        'Tab order, preview tabs, and what to confirm before a tab closes.'
      )}
      searchEntries={navigation.getSectionSearchEntries('tabs')}
    >
      {view.isSectionMounted('tabs') ? (
        <TabBehaviorSettings settings={model.settings} updateSettings={model.updateSettings} />
      ) : null}
    </SettingsSection>
  )
}

// The editor, CLI and update blocks below carry their own headings, so their sections add none.
export function renderEditorSettingsSection(context: SettingsRenderContext): React.JSX.Element {
  const { model, interactions, navigation, view } = context
  return (
    <SettingsSection
      id="editor"
      title={translate(
        'auto.components.settings.GeneralEditorSettingsSection.45c6e85c4d',
        'Editor'
      )}
      description={translate(
        'settings.sections.editor.description',
        'Saving, fonts, diffs, and Markdown.'
      )}
      searchEntries={navigation.getSectionSearchEntries('editor')}
      hideHeader
    >
      {view.isSectionMounted('editor') ? (
        <GeneralEditorSettingsSection
          settings={model.settings}
          updateSettings={model.updateSettings}
          fontSuggestions={model.terminalFontSuggestions}
          onRequestFontSuggestions={interactions.requestFontSuggestions}
        />
      ) : null}
    </SettingsSection>
  )
}

export function renderCliSettingsSection(context: SettingsRenderContext): React.JSX.Element {
  const { model, navigation, terminal, view } = context
  return (
    <SettingsSection
      id="cli"
      title={translate('settings.sections.cli.title', 'Markov CLI')}
      description={translate(
        'settings.sections.cli.description',
        'The markov command, and the skill that teaches agents to use it.'
      )}
      searchEntries={navigation.getSectionSearchEntries('cli')}
      hideHeader
    >
      {view.isSectionMounted('cli') ? (
        <CliSection
          currentPlatform={desktopPlatformFromUserAgent(navigator.userAgent)}
          settings={model.settings}
          wslSupportedPlatform={terminal.localWslSupportedPlatform}
          wslAvailable={terminal.localWindowsRuntimeCapabilities.wslAvailable}
          wslCapabilitiesLoading={terminal.localWindowsRuntimeCapabilities.isLoading}
        />
      ) : null}
    </SettingsSection>
  )
}

export function renderUpdatesSettingsSection(context: SettingsRenderContext): React.JSX.Element {
  const { navigation, view } = context
  return (
    <SettingsSection
      id="updates"
      title={translate(
        'auto.components.settings.GeneralUpdateSettingsSection.f2b1ccc12a',
        'Updates'
      )}
      description={translate(
        'settings.sections.updates.description',
        'The installed version, update checks, and ways to support Markov.'
      )}
      searchEntries={navigation.getSectionSearchEntries('updates')}
      hideHeader
    >
      {view.isSectionMounted('updates') ? (
        <div className="space-y-6">
          <GeneralUpdateSettingsSection />
          <GeneralSupportSection hasPrecedingSections />
        </div>
      ) : null}
    </SettingsSection>
  )
}
