import { Cable } from 'lucide-react'
import type { McpConnectionSummary } from '../../../../../shared/mcp-connections'
import { translate } from '@/i18n/i18n'
import { PluginCatalogEmptyState } from '../../plugins/list/PluginCatalogEmptyState'
import { ConnectionRow } from './ConnectionRow'
import type { ConnectionToolsView } from './ConnectionToolList'

const LOADING_TOOLS: ConnectionToolsView = { state: 'loading' }

export type ConnectionsListProps = {
  /** Null while the saved connections are loading. */
  connections: McpConnectionSummary[] | null
  busy: boolean
  signingInId: string | null
  /** Connections whose tool list is open. */
  openToolIds: readonly string[]
  /** What each opened connection last loaded, by connection id. */
  toolViews: Readonly<Record<string, ConnectionToolsView>>
  onToolsOpenChange: (connection: McpConnectionSummary, open: boolean) => void
  onToggle: (connection: McpConnectionSummary) => void
  onCheck: (connection: McpConnectionSummary) => void
  onSignIn: (connection: McpConnectionSummary) => void
  onCancelSignIn: (connection: McpConnectionSummary) => void
  onSignOut: (connection: McpConnectionSummary) => void
  onRemove: (connection: McpConnectionSummary) => void
}

export function ConnectionsList({
  connections,
  busy,
  signingInId,
  openToolIds,
  toolViews,
  onToolsOpenChange,
  onToggle,
  onCheck,
  onSignIn,
  onCancelSignIn,
  onSignOut,
  onRemove
}: ConnectionsListProps): React.JSX.Element | null {
  if (!connections) {
    return null
  }
  if (connections.length === 0) {
    return (
      <PluginCatalogEmptyState
        icon={Cable}
        title={translate('settings.connections.emptyTitle', 'No MCP servers yet')}
        description={translate(
          'settings.connections.emptyDescription',
          'Add a server by its web address or by the command that starts it. Claude Code and Codex started from Markov can then use its tools.'
        )}
      />
    )
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {connections.map((connection) => (
          <ConnectionRow
            key={connection.id}
            connection={connection}
            busy={busy}
            signingIn={signingInId === connection.id}
            toolsOpen={openToolIds.includes(connection.id)}
            tools={toolViews[connection.id] ?? LOADING_TOOLS}
            onToolsOpenChange={(open) => onToolsOpenChange(connection, open)}
            onToggle={() => onToggle(connection)}
            onCheck={() => onCheck(connection)}
            onSignIn={() => onSignIn(connection)}
            onCancelSignIn={() => onCancelSignIn(connection)}
            onSignOut={() => onSignOut(connection)}
            onRemove={() => onRemove(connection)}
          />
        ))}
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        {translate(
          'settings.connections.note',
          'Claude Code and Codex started from Markov get the tools of every connection that is on. Start a new agent session after you add or change one.'
        )}
      </p>
    </div>
  )
}
