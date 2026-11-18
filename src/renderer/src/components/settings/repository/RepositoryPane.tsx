import type { GhAccountBinding } from '../../../../../shared/github/account-binding'
import { useCallback, useRef, useState } from 'react'
import { SettingsTabBar } from '../section-layout/SettingsTabBar'
import { RepositoryIdentitySection } from './identity/RepositoryIdentitySection'
import {
  getRepositoryPaneTabTitles,
  REPOSITORY_PANE_TAB_IDS,
  repositoryPaneTabForRequest,
  type RepositoryPaneTabId
} from './repository-pane-tabs'
import type { SettingsSettingRequest } from '../navigation/settings-setting-request'
import type { MarkovHooks, RepoHookSettings } from '../../../../../shared/markov-yaml-hook-types'
import type { Project, ProjectUpdateArgs } from '../../../../../shared/project-types'
import type { Repo } from '../../../../../shared/repo-types'
import type { SourceControlAiSettingsPatch } from '../../../../../shared/source-control/ai/settings/source-control-ai-settings-types'
import { isFolderRepo } from '../../../../../shared/repo-kind'
import { getRepoExecutionHostId, type ExecutionHostId } from '../../../../../shared/execution-host'
import { useShallow } from 'zustand/react/shallow'
import { RepositoryHooksSection } from './execution/RepositoryHooksSection'
import { McpConfigSection } from './mcp/McpConfigSection'
import { WorktreeSymlinksSection } from './execution/WorktreeSymlinksSection'
import { SparsePresetSettingsSection } from './execution/SparsePresetSettingsSection'
import { RepositorySourceControlAiSection } from './source-control/RepositorySourceControlAiSection'
import type { SettingsProjectRemovalScope } from '../navigation/settings-project-list'
import { matchesSettingsSearch } from '../search/settings-search'
import { useAppStore } from '@/store/index'
import { getRepositoryPaneSearchEntries } from './repository-search'
import { RepositoryHostSetupsSection } from './execution/RepositoryHostSetupsSection'
import { RepositoryForkSyncSection } from './execution/RepositoryForkSyncSection'
import { RepositoryGitHubAccountSection } from './RepositoryGitHubAccountSection'
import { translate } from '@/i18n/i18n'
import { RepositoryWindowsRuntimeSection } from './execution/RepositoryWindowsRuntimeSection'
import { matchesRepositoryIdentitySearch } from './identity/repository-identity-search'
import { RepositoryWorktreeDefaultsSection } from './execution/RepositoryWorktreeDefaultsSection'
import { getProjectRuntimeSessionSummary } from './execution/repository-runtime-session-summary'
import { getRepoOwnerWorktreeVisibilityDefaults } from '../../../store/worktree-visibility-defaults-by-host'
import {
  RepositoryFormatterSection,
  getRepositoryFormatterSearchEntry
} from './RepositoryFormatterSection'

type RepositoryPaneRepoUpdate = Omit<
  Partial<Repo>,
  'sourceControlAi' | 'externalWorktreeVisibility' | 'ghAccount'
> & {
  sourceControlAi?: Repo['sourceControlAi'] | null
  externalWorktreeVisibility?: Repo['externalWorktreeVisibility'] | null
  ghAccount?: GhAccountBinding | null
}

const EMPTY_WSL_DISTROS: string[] = []

type RepositoryPaneProps = {
  repo: Repo
  yamlHooks: MarkovHooks | null
  hasHooksFile: boolean
  hooksInspectionReady: boolean
  mayNeedUpdate: boolean
  updateRepo: (
    repoId: string,
    updates: RepositoryPaneRepoUpdate,
    options?: { hostId?: ExecutionHostId }
  ) => void | Promise<boolean>
  removeProject: (repoId: string) => void
  project?: Project | null
  selectedProjectSetupId?: string
  settingsSelectionKey?: string
  settingsEntryRepoIds?: ReadonlySet<string>
  removalScope?: SettingsProjectRemovalScope
  isLocalWindowsProject?: boolean
  wslAvailable?: boolean
  wslDistros?: string[]
  wslCapabilitiesLoading?: boolean
  updateProject?: (
    projectId: string,
    updates: ProjectUpdateArgs['updates']
  ) => void | Promise<unknown>
  /** Lets the repository's text pickers save model lists its host reports. */
  writeSourceControlAiSettings?: (patch: SourceControlAiSettingsPatch) => Promise<void>
  /** A setting to open the pane on: the tab that holds it is selected. */
  settingRequest?: SettingsSettingRequest | null
}

export function RepositoryPane({
  repo,
  yamlHooks,
  hasHooksFile,
  hooksInspectionReady,
  mayNeedUpdate,
  updateRepo,
  removeProject,
  project = null,
  selectedProjectSetupId,
  settingsSelectionKey,
  settingsEntryRepoIds,
  removalScope = 'project',
  isLocalWindowsProject = false,
  wslAvailable = false,
  wslDistros = EMPTY_WSL_DISTROS,
  wslCapabilitiesLoading = false,
  updateProject,
  writeSourceControlAiSettings,
  settingRequest = null
}: RepositoryPaneProps): React.JSX.Element {
  const isFolder = isFolderRepo(repo)
  // Bind writes to the switcher-selected owner; same-ID/self-paired repos must not use focused-host fallback.
  const selectedHostId = getRepoExecutionHostId(repo)
  const updateSelectedRepo = useCallback(
    (repoId: string, updates: RepositoryPaneRepoUpdate) =>
      updateRepo(repoId, updates, { hostId: selectedHostId }),
    [updateRepo, selectedHostId]
  )
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const settings = useAppStore((state) => state.settings)
  const worktreeVisibilityDefaultsByHost = useAppStore(
    (state) => state.worktreeVisibilityDefaultsByHost
  )
  const repoOwnerSettings = settings
    ? {
        ...settings,
        worktreeVisibilityDefaults: getRepoOwnerWorktreeVisibilityDefaults(
          repo,
          settings,
          worktreeVisibilityDefaultsByHost
        )
      }
    : null
  const fetchWorktrees = useAppStore((state) => state.fetchWorktrees)
  const runtimeSessionSummary = useAppStore(
    useShallow((state) => getProjectRuntimeSessionSummary(state, repo.id))
  )
  const [copiedTemplate, setCopiedTemplate] = useState(false)
  const copiedTemplateResetTimerRef = useRef<number | null>(null)
  // Clipboard IPC may outlive navigation; do not start timers after pane detach.
  const isMountedRef = useRef(false)
  // Project-name search navigates to the project; it must not hide child controls that omit the name.
  const forceFullPaneForRepoMatch = matchesRepositoryIdentitySearch(searchQuery, repo)

  const clearCopiedTemplateResetTimer = useCallback((): void => {
    if (copiedTemplateResetTimerRef.current !== null) {
      window.clearTimeout(copiedTemplateResetTimerRef.current)
      copiedTemplateResetTimerRef.current = null
    }
  }, [])

  const setRepositoryPaneRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      isMountedRef.current = node !== null
      if (node === null) {
        clearCopiedTemplateResetTimer()
      }
    },
    [clearCopiedTemplateResetTimer]
  )

  const updateSelectedRepoHookSettings = (nextSettings: RepoHookSettings) => {
    updateSelectedRepo(repo.id, {
      hookSettings: nextSettings
    })
  }

  const handleCopyTemplate = async () => {
    // Make missing-markov.yaml migration a one-click copy of the expected shared-template shape.
    await window.api.ui.writeClipboardText(`scripts:
  setup: |
    pnpm worktree:setup
  archive: |
    echo "Cleaning up before archive"`)
    if (!isMountedRef.current) {
      return
    }
    clearCopiedTemplateResetTimer()
    setCopiedTemplate(true)
    copiedTemplateResetTimerRef.current = window.setTimeout(() => {
      copiedTemplateResetTimerRef.current = null
      setCopiedTemplate(false)
    }, 1500)
  }

  const allEntries = getRepositoryPaneSearchEntries(repo, { isLocalWindowsProject })
  const identityEntryTitles = new Set([
    translate('auto.components.settings.repository.search.7e1e456a95', 'Display Name'),
    translate('auto.components.settings.repository.search.b24f00294a', 'Project Icon'),
    translate('components.RepositoryJiraProjectSection.title', 'Default Jira project'),
    translate('auto.components.settings.repository.search.githubAccount', 'GitHub Account'),
    translate(
      'auto.components.settings.repository.search.keepForkUpToDate',
      'Keep Fork Up to Date'
    ),
    translate('auto.components.settings.repository.search.094adbe930', 'Default Worktree Base'),
    translate('auto.components.settings.repository.search.443d127b5a', 'Worktree Location'),
    translate('auto.components.settings.repository.search.externalWorktrees', 'External worktrees'),
    translate('auto.components.settings.repository.search.projectRuntime', 'Project Runtime'),
    translate('auto.components.settings.repository.search.c5266c2c9d', 'Remove Project')
  ])
  const identityEntries = allEntries.filter((entry) => identityEntryTitles.has(entry.title))
  const sparsePresetEntries = allEntries.filter((entry) =>
    ['Sparse Checkout Presets'].includes(entry.title)
  )
  const hooksEntries = allEntries.filter((entry) =>
    [
      'Setup Script',
      'Archive Script',
      'Advanced',
      'When to Run Setup',
      'Custom GitHub Issue Command'
    ].includes(entry.title)
  )
  const mcpEntries = allEntries.filter((entry) => entry.title === 'MCP Configs')
  const symlinkEntries = allEntries.filter((entry) => entry.title === 'Worktree Shared Paths')
  const sourceControlAiEntries = allEntries.filter((entry) => entry.title === 'Git AI Author')
  const hostSetupEntries = allEntries.filter((entry) => entry.title === 'Available Hosts')
  const projectRuntimeEntries = allEntries.filter((entry) => entry.title === 'Project Runtime')

  const [activeTab, setActiveTab] = useState<RepositoryPaneTabId>('identity')
  const [handledRequestToken, setHandledRequestToken] = useState<number | null>(null)
  if (settingRequest && settingRequest.token !== handledRequestToken) {
    // A link or a search result names a setting; open the tab that holds it before the scroll looks for it.
    setHandledRequestToken(settingRequest.token)
    const worktreeTitles = new Set([
      translate('auto.components.settings.repository.search.094adbe930', 'Default Worktree Base'),
      translate('auto.components.settings.repository.search.443d127b5a', 'Worktree Location'),
      translate(
        'auto.components.settings.repository.search.externalWorktrees',
        'External worktrees'
      ),
      translate('auto.components.settings.repository.search.projectRuntime', 'Project Runtime')
    ])
    const gitTitles = new Set([
      translate('auto.components.settings.repository.search.githubAccount', 'GitHub Account'),
      translate(
        'auto.components.settings.repository.search.keepForkUpToDate',
        'Keep Fork Up to Date'
      )
    ])
    const requestedTab = repositoryPaneTabForRequest(
      settingRequest,
      new Map<string, RepositoryPaneTabId>([
        ...identityEntries.map(
          (entry) =>
            [
              entry.title,
              worktreeTitles.has(entry.title)
                ? 'worktrees'
                : gitTitles.has(entry.title)
                  ? 'git'
                  : 'identity'
            ] as const
        ),
        ...[...hostSetupEntries, ...symlinkEntries, ...sparsePresetEntries].map(
          (entry) => [entry.title, 'worktrees'] as const
        ),
        ...sourceControlAiEntries.map((entry) => [entry.title, 'git'] as const),
        ...hooksEntries.map((entry) => [entry.title, 'scripts'] as const),
        [getRepositoryFormatterSearchEntry().title, 'scripts'] as const,
        ...mcpEntries.map((entry) => [entry.title, 'advanced'] as const)
      ])
    )
    if (requestedTab) {
      setActiveTab(requestedTab)
    }
  }

  const hooksSection =
    !isFolder && (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, hooksEntries)) ? (
      <RepositoryHooksSection
        key="hooks"
        repo={repo}
        yamlHooks={yamlHooks}
        hasHooksFile={hasHooksFile}
        hooksInspectionReady={hooksInspectionReady}
        mayNeedUpdate={mayNeedUpdate}
        copiedTemplate={copiedTemplate}
        forceVisible={forceFullPaneForRepoMatch}
        onCopyTemplate={() => void handleCopyTemplate()}
        onUpdateHookSettings={updateSelectedRepoHookSettings}
      />
    ) : null

  const identityShown =
    forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, identityEntries)
  const formatterEntry = getRepositoryFormatterSearchEntry()
  // Folder projects have no Git, so their worktree, Git and MCP settings do not exist.
  const tabSections: Record<RepositoryPaneTabId, React.ReactNode[]> = {
    identity: [
      identityShown ? (
        <RepositoryIdentitySection
          key="identity"
          repo={repo}
          removalScope={removalScope}
          forceVisible={forceFullPaneForRepoMatch}
          updateRepo={updateSelectedRepo}
          removeProject={removeProject}
        />
      ) : null
    ],
    worktrees:
      isFolder || !identityShown
        ? []
        : [
            <RepositoryHostSetupsSection
              key="hosts"
              repo={repo}
              selectedProjectSetupId={selectedProjectSetupId}
              settingsSelectionKey={settingsSelectionKey}
              settingsEntryRepoIds={settingsEntryRepoIds}
              forceVisible={forceFullPaneForRepoMatch}
              searchQuery={searchQuery}
              searchEntries={hostSetupEntries}
            />,
            <RepositoryWindowsRuntimeSection
              key="runtime"
              repo={repo}
              repoDisplayName={repo.displayName}
              project={project}
              settings={settings}
              isLocalWindowsProject={isLocalWindowsProject}
              wslAvailable={wslAvailable}
              wslDistros={wslDistros}
              wslCapabilitiesLoading={wslCapabilitiesLoading}
              runtimeSessionSummary={runtimeSessionSummary}
              updateProject={updateProject}
              forceVisible={forceFullPaneForRepoMatch}
              searchQuery={searchQuery}
              searchEntries={projectRuntimeEntries}
            />,
            <RepositoryWorktreeDefaultsSection
              key="defaults"
              repo={repo}
              settings={repoOwnerSettings}
              updateRepo={updateSelectedRepo}
              refreshRepo={(repoId) =>
                fetchWorktrees(repoId, {
                  executionHostId: selectedHostId,
                  requireAuthoritative: true
                })
              }
              forceVisible={forceFullPaneForRepoMatch}
            />,
            !repo.connectionId &&
            (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, symlinkEntries)) ? (
              <WorktreeSymlinksSection key="symlinks" repo={repo} updateRepo={updateSelectedRepo} />
            ) : null,
            forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, sparsePresetEntries) ? (
              <SparsePresetSettingsSection key={`sparse-presets:${repo.id}`} repoId={repo.id} />
            ) : null
          ],
    scripts: [
      hooksSection,
      forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, [formatterEntry]) ? (
        <RepositoryFormatterSection
          key={`formatter-${repo.id}-${selectedHostId}`}
          repo={repo}
          updateRepo={updateSelectedRepo}
          forceVisible={forceFullPaneForRepoMatch}
        />
      ) : null
    ],
    git: isFolder
      ? []
      : [
          identityShown ? (
            <RepositoryForkSyncSection
              key="fork"
              repo={repo}
              updateRepo={updateSelectedRepo}
              forceVisible={forceFullPaneForRepoMatch}
            />
          ) : null,
          identityShown ? (
            <RepositoryGitHubAccountSection
              key="github"
              repo={repo}
              updateRepo={updateSelectedRepo}
              forceVisible={forceFullPaneForRepoMatch}
            />
          ) : null,
          forceFullPaneForRepoMatch ||
          matchesSettingsSearch(searchQuery, sourceControlAiEntries) ? (
            <RepositorySourceControlAiSection
              key="source-control-ai"
              repo={repo}
              updateRepo={updateSelectedRepo}
              writeSourceControlAiSettings={writeSourceControlAiSettings}
            />
          ) : null
        ],
    advanced: [
      !isFolder && (forceFullPaneForRepoMatch || matchesSettingsSearch(searchQuery, mcpEntries)) ? (
        <McpConfigSection key={`mcp-configs:${selectedHostId}:${repo.id}`} repo={repo} />
      ) : null
    ]
  }
  const tabIds = REPOSITORY_PANE_TAB_IDS.filter((tabId) => tabSections[tabId].some(Boolean))
  const shownTab = tabIds.includes(activeTab) ? activeTab : tabIds[0]
  const tabTitles = getRepositoryPaneTabTitles()

  return (
    <div ref={setRepositoryPaneRootRef} className="space-y-8">
      {tabIds.length > 1 ? (
        <SettingsTabBar
          label={repo.displayName}
          tabs={tabIds.map((tabId) => ({ id: tabId, title: tabTitles[tabId] }))}
          activeTabId={shownTab}
          onSelectTab={(tabId) => {
            const next = REPOSITORY_PANE_TAB_IDS.find((candidate) => candidate === tabId)
            if (next) {
              setActiveTab(next)
            }
          }}
        />
      ) : null}
      {shownTab ? tabSections[shownTab] : null}
    </div>
  )
}
