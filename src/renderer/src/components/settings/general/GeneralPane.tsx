import type React from 'react'
import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { useAppStore } from '../../../store/index'
import { GeneralWorkspaceSettingsSection } from './GeneralWorkspaceSettingsSection'
import { getGeneralWorkspaceSearchEntries } from './general-search'
import { getGeneralProjectRuntimeSearchEntries } from './project-runtime/general-project-runtime-search'
import { SettingsSectionStack } from '../section-layout/SettingsSectionStack'
import { matchesSettingsSearch, type SettingsSearchEntry } from '../search/settings-search'
import { SettingsSubsectionHeader } from '../form-controls/SettingsFormControls'
import { translate } from '@/i18n/i18n'
import { DefaultWindowsProjectRuntimeSetting } from './project-runtime/DefaultWindowsProjectRuntimeSetting'
import { defaultScopeHost } from '@/lib/default-creation-host'

/** Gate Windows directly: empty search matches empty entries and would leave an orphan header after the inner control self-hides. */
function shouldShowProjectRuntimeSection(
  wslSupportedPlatform: boolean | undefined,
  searchQuery: string,
  projectRuntimeSearchEntries: SettingsSearchEntry[]
): boolean {
  return (
    Boolean(wslSupportedPlatform) && matchesSettingsSearch(searchQuery, projectRuntimeSearchEntries)
  )
}

const EMPTY_WSL_DISTROS: string[] = []

type GeneralPaneProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
  updateSettingsOrThrow?: (updates: Partial<GlobalSettings>) => void | Promise<void>
  wslSupportedPlatform?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
}

/** Where workspaces are created, which ones the sidebar lists, and the default runtime for Windows projects. */
export function GeneralPane({
  settings,
  updateSettings,
  updateSettingsOrThrow,
  wslSupportedPlatform,
  wslAvailable,
  wslDistros = EMPTY_WSL_DISTROS,
  wslCapabilitiesLoading
}: GeneralPaneProps): React.JSX.Element {
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const sourceDefaultsSupportedRuntimeEnvironmentId = useAppStore(
    (s) => s.worktreeVisibilitySourceDefaultsSupportedRuntimeEnvironmentId
  )
  const defaultsSupportedRuntimeEnvironmentId = useAppStore(
    (s) => s.worktreeVisibilityDefaultsSupportedRuntimeEnvironmentId
  )
  // Until Settings chooses a host, the store mirrors visibility defaults from the default scope host.
  const activeRuntimeTarget = defaultScopeHost(settings)
  const defaultsSupported =
    activeRuntimeTarget.kind === 'local' ||
    activeRuntimeTarget.environmentId === defaultsSupportedRuntimeEnvironmentId
  const sourceDefaultsSupported =
    defaultsSupported &&
    (activeRuntimeTarget.kind === 'local' ||
      activeRuntimeTarget.environmentId === sourceDefaultsSupportedRuntimeEnvironmentId)
  const projectRuntimeSearchEntries = wslSupportedPlatform
    ? getGeneralProjectRuntimeSearchEntries()
    : []

  const visibleSections = [
    matchesSettingsSearch(searchQuery, getGeneralWorkspaceSearchEntries()) ? (
      <GeneralWorkspaceSettingsSection
        key="workspace"
        settings={settings}
        updateSettings={updateSettings}
        updateSettingsOrThrow={updateSettingsOrThrow}
        defaultsSupported={defaultsSupported}
        sourceDefaultsSupported={sourceDefaultsSupported}
      />
    ) : null,
    shouldShowProjectRuntimeSection(
      wslSupportedPlatform,
      searchQuery,
      projectRuntimeSearchEntries
    ) ? (
      <section key="project-runtime" className="space-y-4">
        <SettingsSubsectionHeader
          title={translate(
            'auto.components.settings.GeneralPane.projectRuntime',
            'Project Runtime'
          )}
          description={translate(
            'auto.components.settings.GeneralPane.projectRuntimeDescription',
            'Default runtime for local Windows projects that do not override it.'
          )}
        />
        <DefaultWindowsProjectRuntimeSetting
          settings={settings}
          updateSettings={updateSettings}
          wslSupportedPlatform={Boolean(wslSupportedPlatform)}
          wslAvailable={Boolean(wslAvailable)}
          wslDistros={wslDistros}
          wslCapabilitiesLoading={Boolean(wslCapabilitiesLoading)}
        />
      </section>
    ) : null
  ]

  return <SettingsSectionStack sections={visibleSections} spacing="section" />
}
