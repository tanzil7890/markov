import type {
  McpConnectionState,
  McpConnectionSummary,
  McpConnectionTool
} from '../../../../../shared/mcp-connections'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import { ConnectionsList, type ConnectionsListProps } from './ConnectionsList'

const ACTIONS: Omit<ConnectionsListProps, 'connections' | 'signingInId'> = {
  busy: false,
  openToolIds: [],
  toolViews: {},
  onToolsOpenChange: () => undefined,
  onToggle: () => undefined,
  onCheck: () => undefined,
  onSignIn: () => undefined,
  onCancelSignIn: () => undefined,
  onSignOut: () => undefined,
  onRemove: () => undefined
}

function connection(
  name: string,
  title: string,
  state: McpConnectionState,
  extra: Partial<McpConnectionSummary> = {}
): McpConnectionSummary {
  return {
    id: name,
    name,
    title,
    enabled: state !== 'disabled',
    transport: { kind: 'http', url: `https://mcp.${name}.example/mcp` },
    secretNames: [],
    createdAt: 0,
    signedIn: false,
    status: { state, toolCount: null, message: null },
    ...extra
  }
}

const CONNECTIONS: McpConnectionSummary[] = [
  connection('linear', 'Linear', 'connected', {
    signedIn: true,
    status: { state: 'connected', toolCount: 23, message: null }
  }),
  connection('files', 'Project files', 'connected', {
    transport: {
      kind: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '~/code']
    },
    status: { state: 'connected', toolCount: 1, message: null }
  }),
  connection('notion', 'Notion', 'needs-sign-in', {
    status: {
      state: 'needs-sign-in',
      toolCount: null,
      message: 'This server needs a sign-in or an API key.'
    }
  }),
  connection('sentry', 'Sentry', 'failed', {
    status: {
      state: 'failed',
      toolCount: null,
      message: 'Could not reach the MCP server: getaddrinfo ENOTFOUND mcp.sentry.example'
    }
  }),
  connection('github', 'GitHub', 'disabled')
]

const LINEAR_TOOLS: McpConnectionTool[] = [
  { name: 'list_issues', description: 'List issues in the workspace, newest first.' },
  {
    name: 'get_issue',
    description:
      'Retrieve one issue by its identifier, with its description, comments, attachments, labels, assignee, cycle and project, so an agent can read the whole thread before acting on it.'
  },
  { name: 'create_issue', description: 'Create an issue in a team.' },
  { name: 'update_issue', description: 'Change the title, state, assignee or labels of an issue.' },
  { name: 'list_teams', description: null },
  { name: 'list_projects', description: 'List the projects the signed-in person can see.' },
  { name: 'create_comment', description: 'Add a comment to an issue.' },
  { name: 'list_cycles', description: 'List the cycles of a team.' },
  { name: 'search_documentation', description: 'Search the product documentation.' }
]

export const empty = defineFixture({
  width: 720,
  render: () => <ConnectionsList {...ACTIONS} connections={[]} signingInId={null} />
})

export const states = defineFixture({
  width: 720,
  render: () => <ConnectionsList {...ACTIONS} connections={CONNECTIONS} signingInId={null} />
})

export const signingIn = defineFixture({
  width: 720,
  render: () => <ConnectionsList {...ACTIONS} connections={CONNECTIONS} signingInId="notion" />
})

export const toolsOpen = defineFixture({
  width: 720,
  render: () => (
    <ConnectionsList
      {...ACTIONS}
      connections={CONNECTIONS}
      signingInId={null}
      openToolIds={['linear', 'files']}
      toolViews={{
        linear: { state: 'ready', tools: LINEAR_TOOLS },
        files: {
          state: 'ready',
          tools: [{ name: 'read_file', description: 'Read a file from the allowed folders.' }]
        }
      }}
    />
  )
})

export const toolsLoading = defineFixture({
  width: 720,
  render: () => (
    <ConnectionsList
      {...ACTIONS}
      connections={CONNECTIONS.slice(0, 1)}
      signingInId={null}
      openToolIds={['linear']}
    />
  )
})
