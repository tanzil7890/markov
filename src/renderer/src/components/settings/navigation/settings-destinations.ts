import {
  getSettingsDestinationCopy,
  getSettingsDestinationGroupTitles
} from './settings-destination-copy'

export type SettingsDestinationGroupId = 'agents' | 'workspace' | 'interface' | 'account' | 'system'

export type SettingsDestinationTab = {
  id: string
  title: string
  sectionIds: string[]
}

/** A sidebar entry. It shows one or more settings sections, split into tabs when there are many. */
export type SettingsDestination = {
  id: string
  group: SettingsDestinationGroupId | null
  title: string
  description: string
  tabs: SettingsDestinationTab[]
}

export type SettingsDestinationLocation = {
  destination: SettingsDestination
  tab: SettingsDestinationTab
}

type DestinationLayout = {
  id: string
  group: SettingsDestinationGroupId | null
  /** Tab id, then the sections that tab stacks. */
  tabs: readonly (readonly [string, readonly string[]])[]
}

const GROUP_ORDER: readonly SettingsDestinationGroupId[] = [
  'agents',
  'workspace',
  'interface',
  'account',
  'system'
]

const LAYOUT: readonly DestinationLayout[] = [
  {
    id: 'overview',
    group: null,
    tabs: [
      ['status', ['overview']],
      ['setup', ['setup-guide']]
    ]
  },
  { id: 'agents', group: 'agents', tabs: [['all', ['agents']]] },
  { id: 'accounts', group: 'agents', tabs: [['all', ['accounts']]] },
  {
    id: 'connections',
    group: 'agents',
    // Everything Markov or its agents plug into lives here, so the sidebar has one place for it.
    tabs: [
      ['mcp', ['connections']],
      ['plugins', ['plugins']],
      ['integrations', ['integrations', 'tasks']]
    ]
  },
  {
    id: 'skills',
    group: 'agents',
    tabs: [
      ['orchestration', ['orchestration']],
      ['computerUse', ['computer-use']],
      ['cli', ['cli']],
      ['linear', ['linear']]
    ]
  },
  {
    id: 'workspaces',
    group: 'workspace',
    tabs: [
      ['workspaces', ['general']],
      ['tabs', ['tabs']],
      ['editor', ['editor']]
    ]
  },
  {
    id: 'terminal',
    group: 'workspace',
    tabs: [
      ['terminal', ['terminal']],
      ['quickCommands', ['quick-commands']]
    ]
  },
  {
    id: 'browser',
    group: 'workspace',
    tabs: [
      ['browser', ['browser']],
      ['emulator', ['mobile-emulator']]
    ]
  },
  {
    id: 'git',
    group: 'workspace',
    tabs: [
      ['git', ['git']],
      ['ai', ['git-ai']]
    ]
  },
  {
    id: 'features',
    group: 'workspace',
    tabs: [
      [
        'features',
        ['automations', 'artifacts', 'share-skills', 'session-history', 'floating-workspace']
      ],
      ['experimental', ['experimental']]
    ]
  },
  {
    id: 'appearance',
    group: 'interface',
    tabs: [
      ['app', ['appearance']],
      ['terminal', ['appearance-terminal']],
      ['window', ['appearance-window']]
    ]
  },
  { id: 'chat', group: 'interface', tabs: [['all', ['chat']]] },
  { id: 'notifications', group: 'interface', tabs: [['all', ['notifications']]] },
  { id: 'shortcuts', group: 'interface', tabs: [['all', ['shortcuts']]] },
  { id: 'input', group: 'interface', tabs: [['all', ['voice', 'input']]] },
  { id: 'account', group: 'account', tabs: [['all', ['markov-account']]] },
  {
    id: 'devices',
    group: 'account',
    tabs: [
      ['phones', ['mobile']],
      ['servers', ['servers']],
      ['ssh', ['ssh']]
    ]
  },
  { id: 'usage', group: 'account', tabs: [['all', ['stats']]] },
  { id: 'privacy', group: 'system', tabs: [['all', ['developer-permissions', 'privacy']]] },
  { id: 'advanced', group: 'system', tabs: [['all', ['updates', 'advanced', 'dev']]] }
]

/** Destinations and tabs that have at least one section on this client and platform. */
export function resolveSettingsDestinations(
  availableSectionIds: ReadonlySet<string>
): SettingsDestination[] {
  const copy = getSettingsDestinationCopy()
  return LAYOUT.flatMap((layout) => {
    const text = copy[layout.id]
    const tabs = layout.tabs.flatMap(([tabId, tabSectionIds]) => {
      const sectionIds = tabSectionIds.filter((sectionId) => availableSectionIds.has(sectionId))
      return sectionIds.length > 0 ? [{ id: tabId, title: text.tabs[tabId] ?? '', sectionIds }] : []
    })
    return tabs.length > 0
      ? [
          {
            id: layout.id,
            group: layout.group,
            title: text.title,
            description: text.description ?? '',
            tabs
          }
        ]
      : []
  })
}

export function locateSettingsSection(
  destinations: readonly SettingsDestination[],
  sectionId: string
): SettingsDestinationLocation | null {
  for (const destination of destinations) {
    const tab = destination.tabs.find((candidate) => candidate.sectionIds.includes(sectionId))
    if (tab) {
      return { destination, tab }
    }
  }
  return null
}

export function getSettingsDestinationGroups(): {
  id: SettingsDestinationGroupId
  title: string
}[] {
  const titles = getSettingsDestinationGroupTitles()
  return GROUP_ORDER.map((id) => ({ id, title: titles[id] }))
}

/** A section standing alone keeps its own header; anything else sits under the page header. */
export function isSingleSectionDestination(destination: SettingsDestination): boolean {
  return destination.tabs.length === 1 && destination.tabs[0].sectionIds.length === 1
}
