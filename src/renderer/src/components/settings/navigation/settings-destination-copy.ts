import { translate } from '@/i18n/i18n'

export type SettingsDestinationCopy = {
  title: string
  /** Shown under the title when the page holds several sections; a single section brings its own. */
  description?: string
  /** Tab names by tab id; a destination with one page has none. */
  tabs: Record<string, string>
}

export function getSettingsDestinationGroupTitles(): Record<string, string> {
  return {
    agents: translate('auto.components.settings.Settings.8afa676615', 'Agents'),
    workspace: translate('settings.destinations.groups.workspace', 'Workspace'),
    interface: translate('auto.components.settings.Settings.8bd117d669', 'Interface'),
    account: translate('settings.destinations.groups.account', 'Account'),
    system: translate('settings.destinations.groups.system', 'System')
  }
}

/** Names and summaries of the sidebar entries, by destination id. */
export function getSettingsDestinationCopy(): Record<string, SettingsDestinationCopy> {
  return {
    overview: {
      title: translate('settings.destinations.overview.title', 'Overview'),
      description: translate(
        'settings.destinations.overview.description',
        'What needs you, and where to start.'
      ),
      tabs: {
        status: translate('settings.destinations.overview.tabs.status', 'Overview'),
        setup: translate('settings.destinations.overview.tabs.setup', 'Setup checklist')
      }
    },
    agents: {
      title: translate('auto.components.settings.Settings.8afa676615', 'Agents'),
      tabs: {}
    },
    accounts: {
      title: translate('settings.destinations.accounts.title', 'Accounts'),
      tabs: {}
    },
    connections: {
      title: translate('settings.connections.title', 'Connections'),
      description: translate(
        'settings.destinations.connections.description',
        'MCP servers, plugins and services that Markov and your agents connect to.'
      ),
      tabs: {
        mcp: translate('settings.destinations.connections.tabs.mcp', 'MCP'),
        plugins: translate('auto.components.settings.PluginsSettingsSection.title', 'Plugins'),
        integrations: translate('auto.components.settings.Settings.c9ca101a3b', 'Integrations')
      }
    },
    skills: {
      title: translate('settings.destinations.skills.title', 'Skills'),
      description: translate(
        'settings.destinations.skills.description',
        'What agents can do on this computer, and whether each skill is installed.'
      ),
      tabs: {
        orchestration: translate('auto.components.settings.Settings.00c3a7950d', 'Orchestration'),
        computerUse: translate('settings.destinations.skills.tabs.computerUse', 'Computer use'),
        cli: translate('settings.destinations.skills.tabs.cli', 'Markov CLI'),
        linear: translate('auto.components.settings.Settings.linearTitle', 'Linear')
      }
    },
    workspaces: {
      title: translate('settings.destinations.workspaces.title', 'Workspaces'),
      description: translate(
        'settings.destinations.workspaces.description',
        'Where workspaces live, how tabs behave, and the editor.'
      ),
      tabs: {
        workspaces: translate('settings.destinations.workspaces.tabs.workspaces', 'Workspaces'),
        tabs: translate('settings.destinations.workspaces.tabs.tabs', 'Tabs'),
        editor: translate('settings.destinations.workspaces.tabs.editor', 'Editor')
      }
    },
    terminal: {
      title: translate('auto.components.settings.Settings.3de4bbb841', 'Terminal'),
      description: translate(
        'settings.destinations.terminal.description',
        'Shells, rendering, sessions, and saved commands.'
      ),
      tabs: {
        terminal: translate('auto.components.settings.Settings.3de4bbb841', 'Terminal'),
        quickCommands: translate(
          'settings.destinations.terminal.tabs.quickCommands',
          'Quick commands'
        )
      }
    },
    browser: {
      title: translate('auto.components.settings.Settings.c46215ea03', 'Browser'),
      description: translate(
        'settings.destinations.browser.description',
        'Home page, links, logins, and the mobile emulator.'
      ),
      tabs: {
        browser: translate('auto.components.settings.Settings.c46215ea03', 'Browser'),
        emulator: translate('settings.destinations.browser.tabs.emulator', 'Mobile emulator')
      }
    },
    git: {
      title: translate('settings.destinations.git.title', 'Git'),
      description: translate(
        'settings.destinations.git.description',
        'Branch names, comparisons, and AI help with commits and pull requests.'
      ),
      tabs: {
        git: translate('settings.destinations.git.tabs.git', 'Git'),
        ai: translate('settings.destinations.git.tabs.ai', 'AI actions')
      }
    },
    features: {
      title: translate('settings.destinations.features.title', 'Features'),
      description: translate(
        'settings.destinations.features.description',
        'Optional features: turn them on or off and choose where they appear.'
      ),
      tabs: {
        features: translate('settings.destinations.features.tabs.features', 'Features'),
        experimental: translate('auto.components.settings.Settings.8b017f2506', 'Experimental')
      }
    },
    appearance: {
      title: translate('auto.components.settings.Settings.2b4474780a', 'Appearance'),
      description: translate(
        'settings.destinations.appearance.description',
        'Theme, fonts, and what the sidebar and status bar show.'
      ),
      tabs: {
        app: translate('settings.destinations.appearance.tabs.app', 'App'),
        terminal: translate('auto.components.settings.Settings.3de4bbb841', 'Terminal'),
        window: translate('settings.destinations.appearance.tabs.window', 'Sidebar & status bar')
      }
    },
    chat: {
      title: translate('settings.destinations.chat.title', 'Chat'),
      tabs: {}
    },
    notifications: {
      title: translate('auto.components.settings.Settings.9907545fa3', 'Notifications'),
      tabs: {}
    },
    shortcuts: {
      title: translate('auto.components.settings.Settings.23bf7a1ad4', 'Shortcuts'),
      tabs: {}
    },
    input: {
      title: translate('settings.destinations.input.title', 'Input'),
      description: translate(
        'settings.destinations.input.description',
        'Dictation, selection, and editing.'
      ),
      tabs: {}
    },
    account: {
      title: translate('settings.destinations.account.title', 'Account'),
      tabs: {}
    },
    devices: {
      title: translate('settings.destinations.devices.title', 'Devices'),
      description: translate(
        'settings.destinations.devices.description',
        'Phones, servers, and SSH hosts that work with this computer.'
      ),
      tabs: {
        phones: translate('settings.destinations.devices.tabs.phones', 'Phones'),
        servers: translate('settings.destinations.devices.tabs.servers', 'Servers'),
        ssh: translate('settings.destinations.devices.tabs.ssh', 'SSH hosts')
      }
    },
    usage: {
      title: translate('settings.destinations.usage.title', 'Usage'),
      tabs: {}
    },
    privacy: {
      title: translate('settings.destinations.privacy.title', 'Privacy & permissions'),
      description: translate(
        'settings.destinations.privacy.description',
        'What Markov may access on this computer, and what it sends.'
      ),
      tabs: {}
    },
    advanced: {
      title: translate('auto.components.settings.Settings.1c87f8d024', 'Advanced'),
      description: translate(
        'settings.destinations.advanced.description',
        'Updates, network compatibility, and troubleshooting.'
      ),
      tabs: {}
    }
  }
}
