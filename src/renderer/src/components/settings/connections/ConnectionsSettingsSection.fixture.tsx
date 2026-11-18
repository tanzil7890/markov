import type { McpConnectionSummary } from '../../../../../shared/mcp-connections'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { ConfirmationDialogProvider } from '../../confirmation-dialog'
import { ActiveSettingsSectionProvider } from '../section-layout/SettingsSection'
import { ConnectionsSettingsSection } from './ConnectionsSettingsSection'

const CONNECTIONS: McpConnectionSummary[] = [
  {
    id: 'asteroid',
    name: 'asteroid',
    title: 'Asteroid',
    enabled: true,
    transport: { kind: 'http', url: 'https://mcp.asteroid.example/mcp' },
    secretNames: [],
    createdAt: 0,
    signedIn: true,
    status: { state: 'connected', toolCount: 162, message: null }
  },
  {
    id: 'files',
    name: 'files',
    title: 'Project files',
    enabled: true,
    transport: {
      kind: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '~/code']
    },
    secretNames: [],
    createdAt: 0,
    signedIn: false,
    status: { state: 'connected', toolCount: 1, message: null }
  }
]

function stubConnections(connections: McpConnectionSummary[]): void {
  const done = async (): Promise<{ ok: true }> => ({ ok: true })
  window.api.mcpConnections = {
    list: async () => connections,
    add: done,
    remove: done,
    setEnabled: done,
    check: done,
    tools: async () => ({
      ok: true,
      tools: Array.from({ length: 162 }, (_unused, index) => ({
        name: `workflow_step_${String(index + 1).padStart(3, '0')}`,
        description: 'Run one step of a workflow and return what it produced.'
      }))
    }),
    signIn: done,
    cancelSignIn: async () => undefined,
    signOut: done,
    onChanged: () => () => undefined
  }
}

function section(localHost = true): React.JSX.Element {
  return (
    <ConfirmationDialogProvider>
      <ActiveSettingsSectionProvider value="connections">
        <ConnectionsSettingsSection mounted localHost={localHost} searchEntries={[]} />
      </ActiveSettingsSectionProvider>
    </ConfirmationDialogProvider>
  )
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 350))
}

export const mcp = defineFixture({
  width: 960,
  setup: () => stubConnections(CONNECTIONS),
  render: () => section()
})

export const mcpEmpty = defineFixture({
  width: 960,
  setup: () => stubConnections([]),
  render: () => section()
})

export const mcpToolsOpen = defineFixture({
  width: 960,
  setup: () => stubConnections(CONNECTIONS),
  render: () => section(),
  interact: async (frame) => {
    await settle()
    frame.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')?.click()
    await settle()
  }
})

export const otherHost = defineFixture({
  width: 960,
  setup: () => stubConnections(CONNECTIONS),
  render: () => section(false)
})
