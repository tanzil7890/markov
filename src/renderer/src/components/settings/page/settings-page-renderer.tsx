import { SettingsSectionLayoutProvider } from '../section-layout/SettingsSection'
import { SettingsContentScrollElementProvider } from './settings-content-scroll-element'
import { SettingsSidebar } from '../navigation/SettingsSidebar'
import { SettingsDestinationHeader } from '../navigation/SettingsDestinationHeader'
import { SettingsSearchResults } from '../search/SettingsSearchResults'
import { PluginInstallTrustDialogHost } from '../../plugins/dialogs/PluginInstallTrustDialog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SettingsInteractionController } from './use-settings-interaction-controller'
import type { SettingsPresentation, SettingsRenderContext } from './settings-render-context'
import {
  renderAccountsSettingsSection,
  renderAgentsSettingsSection,
  renderDesktopCapabilitySettingsSections,
  renderLinearSettingsSection,
  renderOrchestrationSettingsSection
} from './settings-capability-section-renderers'
import {
  renderArtifactsSettingsSection,
  renderSessionHistorySettingsSection,
  renderAutomationsSettingsSection,
  renderGeneralSettingsSection,
  renderIntegrationsSettingsSection,
  renderMobileSettingsSection,
  renderMarkovAccountSettingsSection,
  renderSetupGuideSettingsSection,
  renderShareSkillsSettingsSection
} from './settings-setup-workflow-section-renderers'
import {
  renderGitAiSettingsSection,
  renderGitSettingsSection,
  renderTasksSettingsSection
} from './settings-git-task-section-renderers'
import {
  renderCliSettingsSection,
  renderEditorSettingsSection,
  renderOverviewSettingsSection,
  renderTabsSettingsSection,
  renderUpdatesSettingsSection
} from './settings-workspace-section-renderers'
import {
  renderBrowserSettingsSection,
  renderFloatingWorkspaceSettingsSection,
  renderMobileEmulatorSettingsSection,
  renderQuickCommandsSettingsSection,
  renderTerminalSettingsSection
} from './settings-interface-primary-section-renderers'
import {
  renderAppearanceSettingsSections,
  renderChatSettingsSection,
  renderInputSettingsSection,
  renderNotificationsSettingsSection,
  renderShortcutsSettingsSection,
  renderStatsSettingsSection
} from './settings-interface-secondary-section-renderers'
import {
  renderDeveloperPermissionsSettingsSection,
  renderPrivacySettingsSection,
  renderServersSettingsSection,
  renderSshSettingsSection
} from './settings-remote-security-section-renderers'
import {
  renderAdvancedSettingsSection,
  renderDevSettingsSection,
  renderExperimentalSettingsSection,
  renderPluginsSettingsSection
} from './settings-advanced-section-renderers'
import { renderProjectSettingsSections } from './settings-project-section-renderer'
import {
  SettingsHostScopePicker,
  shouldShowSettingsHostScopePicker
} from '../host-scope/SettingsHostScopePicker'

// A tab's pane can be a narrow split, so its layout answers to the pane's width, not the window's.
const SETTINGS_ROOT_CLASS_NAME: Record<SettingsPresentation, string> = {
  page: 'page-surface flex min-h-0 flex-1 overflow-hidden bg-background',
  tab: 'page-surface @container/settings flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background'
}

export function renderSettingsLoading(
  interactions: SettingsInteractionController,
  presentation: SettingsPresentation
): React.JSX.Element {
  return (
    <div ref={interactions.setSettingsRootNode} className={SETTINGS_ROOT_CLASS_NAME[presentation]}>
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        {translate('auto.components.settings.Settings.c7ad095d96', 'Loading settings...')}
      </div>
    </div>
  )
}

export function renderSettingsPage(context: SettingsRenderContext): React.JSX.Element {
  const { presentation, model, interactions, actions, view } = context
  const { pageDestination } = view
  return (
    <div ref={interactions.setSettingsRootNode} className={SETTINGS_ROOT_CLASS_NAME[presentation]}>
      <SettingsSidebar
        presentation={presentation}
        settings={model.settings}
        leadingItems={view.leadingRailItems}
        groups={view.railGroups}
        projects={view.railProjects}
        searchInputRef={interactions.searchInputRef}
        // Deep-linked panes/modals own focus; plain entry focuses search.
        searchAutoFocus={model.settingsNavigationTarget == null}
        onBack={interactions.closeSettingsPageWithPromptGuard}
        onSelectSection={(sectionId) => void actions.scrollToSection(sectionId)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!model.isWebClient &&
        shouldShowSettingsHostScopePicker(model.settingsHostScope, model.runtimeEnvironments) ? (
          <SettingsHostScopePicker
            scope={model.settingsHostScope}
            environments={model.runtimeEnvironments}
            onChoose={model.setSettingsHostChoice}
          />
        ) : null}
        <div
          ref={interactions.setContentScrollNode}
          className={cn(
            'min-h-0 flex-1',
            // Why a stable gutter: pages that start or stop scrolling must not shift sideways.
            view.isFocusedShortcutsPane
              ? 'overflow-hidden'
              : 'overflow-y-auto scrollbar-sleek [scrollbar-gutter:stable]'
          )}
        >
          <div
            className={cn(
              'mx-auto flex w-full flex-col gap-8 px-8 pt-8',
              presentation === 'tab' && '@max-[760px]/settings:px-4 @max-[760px]/settings:pt-6',
              view.isFocusedShortcutsPane ? 'h-full pb-6' : 'pb-24',
              view.isWidePane ? 'max-w-6xl' : 'max-w-4xl'
            )}
          >
            {view.isSearching ? (
              <SettingsSearchResults
                query={model.settingsSearchQuery.trim()}
                results={view.searchResults}
                onOpen={(result) => void actions.openSearchResult(result)}
              />
            ) : null}
            {pageDestination ? (
              <SettingsDestinationHeader
                destination={pageDestination}
                activeTabId={view.activeTabId}
                tabIdsNeedingAttention={view.tabIdsNeedingAttention}
                onSelectTab={(tabId) => {
                  const tab = pageDestination.tabs.find((candidate) => candidate.id === tabId)
                  if (tab) {
                    void actions.scrollToSection(tab.sectionIds[0])
                  }
                }}
              />
            ) : null}
            <SettingsContentScrollElementProvider value={interactions.contentScrollElement}>
              <SettingsSectionLayoutProvider value={view.sectionLayout}>
                {/* Why stay mounted while searching: a section with unsaved edits keeps them. */}
                <div
                  className={
                    view.isSearching
                      ? 'hidden'
                      : 'contents [&>section+section]:border-t [&>section+section]:border-border/60 [&>section+section]:pt-8'
                  }
                >
                  {renderOverviewSettingsSection(context)}
                  {renderSetupGuideSettingsSection(context)}
                  {renderAgentsSettingsSection(context)}
                  {renderAccountsSettingsSection(context)}
                  {renderOrchestrationSettingsSection(context)}
                  {renderLinearSettingsSection(context)}
                  {renderDesktopCapabilitySettingsSections(context)}
                  {renderPluginsSettingsSection(context)}
                  {renderCliSettingsSection(context)}
                  {renderMarkovAccountSettingsSection(context)}
                  {renderGeneralSettingsSection(context)}
                  {renderTabsSettingsSection(context)}
                  {renderEditorSettingsSection(context)}
                  {renderIntegrationsSettingsSection(context)}
                  {renderMobileSettingsSection(context)}
                  {renderAutomationsSettingsSection(context)}
                  {renderArtifactsSettingsSection(context)}
                  {renderShareSkillsSettingsSection(context)}
                  {renderSessionHistorySettingsSection(context)}
                  {renderGitSettingsSection(context)}
                  {renderGitAiSettingsSection(context)}
                  {renderTasksSettingsSection(context)}
                  {renderTerminalSettingsSection(context)}
                  {renderQuickCommandsSettingsSection(context)}
                  {renderBrowserSettingsSection(context)}
                  {renderMobileEmulatorSettingsSection(context)}
                  {renderFloatingWorkspaceSettingsSection(context)}
                  {renderAppearanceSettingsSections(context)}
                  {renderChatSettingsSection(context)}
                  {renderInputSettingsSection(context)}
                  {renderNotificationsSettingsSection(context)}
                  {renderShortcutsSettingsSection(context)}
                  {renderStatsSettingsSection(context)}
                  {renderServersSettingsSection(context)}
                  {renderSshSettingsSection(context)}
                  {renderDeveloperPermissionsSettingsSection(context)}
                  {renderPrivacySettingsSection(context)}
                  {renderUpdatesSettingsSection(context)}
                  {renderAdvancedSettingsSection(context)}
                  {renderDevSettingsSection(context)}
                  {renderExperimentalSettingsSection(context)}
                  {renderProjectSettingsSections(context)}
                </div>
              </SettingsSectionLayoutProvider>
            </SettingsContentScrollElementProvider>
          </div>
        </div>
      </div>
      {/* Why page level: Plugins and the Appearance theme pickers both install through it. */}
      <PluginInstallTrustDialogHost />
    </div>
  )
}
