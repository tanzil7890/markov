import { LinearIcon } from '@/components/icons/LinearIcon'
import { getAccountsPaneSearchEntries } from '@/components/settings/accounts/accounts-search'
import { getAgentsPaneSearchEntries } from '@/components/settings/agents/agents-search'
import { getComputerUsePaneSearchEntries } from '@/components/settings/computer-use/computer-use-search'
import { getConnectionsPaneSearchEntries } from '@/components/settings/connections/connections-search'
import {
  getGeneralCliSearchEntries,
  getGeneralNavigationSearchEntries,
  getGeneralUpdateSearchEntries,
  getGeneralWorkspaceSearchEntries
} from '@/components/settings/general/general-search'
import { getGeneralSupportSearchEntries } from '@/components/settings/general/general-support-search'
import { getGeneralProjectRuntimeSearchEntries } from '@/components/settings/general/project-runtime/general-project-runtime-search'
import { getGeneralEditorSearchEntries } from '@/components/settings/editor/general-editor-search'
import { getIntegrationsPaneSearchEntries } from '@/components/settings/integrations/integrations-search'
import { getLinearAgentSkillPaneSearchEntries } from '@/components/settings/skills/linear/linear-agent-skill-search'
import { getMobileSettingsPaneSearchEntries } from '@/components/settings/mobile/mobile-settings-search'
import { getMarkovAccountSettingsSearchEntries } from '@/components/settings/accounts/markov/markov-account-settings-search'
import { MarkovLogoSettingsIcon } from '@/components/settings/page/markov-logo-settings-icon'
import { getOrchestrationPaneSearchEntries } from '@/components/settings/orchestration/orchestration-search'
import { getVoicePaneSearchEntries } from '@/components/settings/voice/voice-pane-search'
import { translate } from '@/i18n/i18n'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import {
  Blocks,
  Bot,
  Cable,
  CircleUserRound,
  Download,
  FilePenLine,
  LayoutDashboard,
  Mic,
  MousePointerClick,
  Network,
  PanelTop,
  SlidersHorizontal,
  Smartphone,
  Terminal,
  UserCog
} from 'lucide-react'
import type { SettingsNavigationBuildOptions } from './settings-navigation-build-options'

export function buildCapabilitySettingsSections({
  isLocalWindowsHost,
  isWebClient,
  isLinearConnected
}: SettingsNavigationBuildOptions): SettingsNavSection[] {
  const showDesktopOnlySettings = !isWebClient
  return [
    {
      id: 'overview',
      title: translate('settings.destinations.overview.title', 'Overview'),
      description: translate(
        'settings.sections.overview.description',
        'What needs your attention, and the settings people change most.'
      ),
      icon: LayoutDashboard,
      searchEntries: []
    },
    {
      id: 'agents',
      title: translate('auto.hooks.useSettingsNavigationMetadata.b49abbd2f7', 'Agents'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.4121f7a0a2',
        'Manage AI agents, set a default, and customize commands.'
      ),
      icon: Bot,
      searchEntries: getAgentsPaneSearchEntries({
        includeAgentAwake: !isWebClient,
        includeAgentChatChoice: !isWebClient,
        includeAgentRuntime: isLocalWindowsHost,
        includeAgentWorkspaceTrust: !isWebClient,
        includeCodexTerminalServerIsolation: !isWebClient
      })
    },
    {
      id: 'accounts',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.f70ac54d38',
        'AI Provider Accounts'
      ),
      description: translate(
        'settings.accounts.navDescription',
        'Optional account switching and usage setup for Claude, Codex, Gemini, and Grok.'
      ),
      icon: UserCog,
      searchEntries: getAccountsPaneSearchEntries(),
      badge: translate('auto.hooks.useSettingsNavigationMetadata.7c79d3b7bf', 'Optional')
    },
    {
      id: 'orchestration',
      title: translate('auto.hooks.useSettingsNavigationMetadata.58a868e8e4', 'Orchestration'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.cd50cec5d7',
        'Coordinate multiple coding agents through Markov.'
      ),
      icon: Network,
      searchEntries: getOrchestrationPaneSearchEntries({
        includeLocalRuntimeSettings: !isWebClient
      })
    },
    // Expose only with connected Linear; its skill needs linked provider capability.
    ...(isLinearConnected
      ? [
          {
            id: 'linear',
            title: translate('auto.hooks.useSettingsNavigationMetadata.linearTitle', 'Linear'),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.linearDescription',
              'How Linear works in Markov, setup checklist, agent skill, and example prompts.'
            ),
            icon: LinearIcon,
            searchEntries: getLinearAgentSkillPaneSearchEntries()
          }
        ]
      : []),
    ...(showDesktopOnlySettings
      ? [
          {
            id: 'connections',
            title: translate('settings.connections.mcpTitle', 'MCP servers'),
            description: translate(
              'settings.connections.description',
              'Connect MCP servers once and use their tools from every agent.'
            ),
            icon: Cable,
            searchEntries: getConnectionsPaneSearchEntries()
          },
          {
            id: 'computer-use',
            title: translate('auto.hooks.useSettingsNavigationMetadata.b35e92364b', 'Computer Use'),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.0059bd17f3',
              'Enable agents to control any app on your computer.'
            ),
            icon: MousePointerClick,
            searchEntries: getComputerUsePaneSearchEntries()
          },
          {
            id: 'voice',
            title: translate('auto.hooks.useSettingsNavigationMetadata.6a50cdcd7c', 'Voice'),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.8ac3de82f5',
              'Local speech-to-text dictation with on-device models.'
            ),
            icon: Mic,
            searchEntries: getVoicePaneSearchEntries()
          }
        ]
      : [])
  ]
}

export function buildSetupSettingsSections({
  isLocalWindowsHost,
  isWebClient
}: SettingsNavigationBuildOptions): SettingsNavSection[] {
  const showDesktopOnlySettings = !isWebClient
  return [
    ...(showDesktopOnlySettings
      ? [
          {
            id: 'markov-account',
            title: translate('auto.components.settings.markovAccount.title', 'Markov Account'),
            description: translate(
              'auto.components.settings.markovAccount.description',
              'Share work instantly and reach your desktop from Markov Mobile wherever you are.'
            ),
            icon: CircleUserRound,
            searchEntries: getMarkovAccountSettingsSearchEntries()
          }
        ]
      : []),
    {
      id: 'setup-guide',
      title: translate(
        'auto.hooks.useSettingsNavigationMetadata.ded9e9032f',
        'Onboarding checklist'
      ),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.5f32ac08f3',
        'Finish the onboarding checklist for core Markov workflows.'
      ),
      icon: MarkovLogoSettingsIcon,
      searchEntries: [
        {
          title: translate(
            'auto.hooks.useSettingsNavigationMetadata.ded9e9032f',
            'Onboarding checklist'
          ),
          description: translate(
            'auto.hooks.useSettingsNavigationMetadata.17005c73d4',
            'Open the onboarding checklist for setup and milestone steps.'
          ),
          keywords: [
            translate('auto.hooks.useSettingsNavigationMetadata.ea0b1bc7b8', 'setup guide'),
            translate(
              'auto.hooks.useSettingsNavigationMetadata.0505d0df29',
              'get started with Markov'
            ),
            translate('auto.hooks.useSettingsNavigationMetadata.724c440e72', 'getting started')
          ]
        }
      ]
    },
    {
      id: 'general',
      title: translate('settings.sections.workspaces.title', 'Workspaces'),
      description: translate(
        'settings.sections.workspaces.description',
        'Where workspaces are created and which ones the sidebar lists.'
      ),
      icon: SlidersHorizontal,
      searchEntries: [
        ...getGeneralWorkspaceSearchEntries(),
        ...(isLocalWindowsHost ? getGeneralProjectRuntimeSearchEntries() : [])
      ]
    },
    {
      id: 'tabs',
      title: translate('settings.sections.tabs.title', 'Tabs'),
      description: translate(
        'settings.sections.tabs.description',
        'Tab order, preview tabs, and what to confirm before a tab closes.'
      ),
      icon: PanelTop,
      searchEntries: getGeneralNavigationSearchEntries()
    },
    {
      id: 'editor',
      title: translate(
        'auto.components.settings.GeneralEditorSettingsSection.45c6e85c4d',
        'Editor'
      ),
      description: translate(
        'settings.sections.editor.description',
        'Saving, fonts, diffs, and Markdown.'
      ),
      icon: FilePenLine,
      searchEntries: getGeneralEditorSearchEntries()
    },
    {
      id: 'cli',
      title: translate('settings.sections.cli.title', 'Markov CLI'),
      description: translate(
        'settings.sections.cli.description',
        'The markov command, and the skill that teaches agents to use it.'
      ),
      icon: Terminal,
      searchEntries: getGeneralCliSearchEntries()
    },
    {
      id: 'updates',
      title: translate(
        'auto.components.settings.GeneralUpdateSettingsSection.f2b1ccc12a',
        'Updates'
      ),
      description: translate(
        'settings.sections.updates.description',
        'The installed version, update checks, and ways to support Markov.'
      ),
      icon: Download,
      searchEntries: [...getGeneralUpdateSearchEntries(), ...getGeneralSupportSearchEntries()]
    },
    {
      id: 'integrations',
      title: translate('settings.integrations.servicesTitle', 'Services'),
      description: translate(
        'auto.hooks.useSettingsNavigationMetadata.33a5e1d597',
        'Connect GitHub, GitLab, Linear, and source-hosting services.'
      ),
      icon: Blocks,
      searchEntries: getIntegrationsPaneSearchEntries()
    },
    ...(showDesktopOnlySettings
      ? [
          {
            id: 'mobile',
            title: translate('auto.hooks.useSettingsNavigationMetadata.1cd25673df', 'Mobile'),
            description: translate(
              'auto.hooks.useSettingsNavigationMetadata.95a1886d94',
              'Control terminals and agents from your phone.'
            ),
            icon: Smartphone,
            searchEntries: getMobileSettingsPaneSearchEntries()
          }
        ]
      : [])
  ]
}
