import type { McpConnectionSummary } from '../../../../../shared/mcp-connections'
import { translate } from '@/i18n/i18n'
import { useConfirmationDialog } from '../../confirmation-dialog-context'
import { AddConnectionDialog } from './AddConnectionDialog'
import { ConnectionsList } from './ConnectionsList'
import type { McpConnectionsModel } from './use-mcp-connections'

type ConnectionsPaneProps = {
  /** Held by the section so the list survives a visit to the Plugins tab. */
  model: McpConnectionsModel
  /** The Add dialog is opened from the section header, above this pane. */
  adding: boolean
  onAddingChange: (adding: boolean) => void
}

export function ConnectionsPane({
  model,
  adding,
  onAddingChange
}: ConnectionsPaneProps): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const { connections, run } = model
  const api = window.api.mcpConnections

  const remove = async (connection: McpConnectionSummary): Promise<void> => {
    const confirmed = await confirm({
      title: translate('settings.connections.removeTitle', 'Remove {{name}}?', {
        name: connection.title
      }),
      description: translate(
        'settings.connections.removeDescription',
        'Agents lose its tools the next time they start. Its saved sign-in and values are deleted from this computer.'
      ),
      confirmLabel: translate('settings.connections.remove', 'Remove'),
      confirmVariant: 'destructive',
      surface: 'security'
    })
    if (confirmed) {
      await run(() => api.remove(connection.id))
    }
  }

  return (
    <>
      <ConnectionsList
        connections={connections}
        busy={model.busy}
        signingInId={model.signingInId}
        openToolIds={model.openToolIds}
        toolViews={model.toolViews}
        onToolsOpenChange={(connection, open) => model.setToolsOpen(connection.id, open)}
        onToggle={(connection) =>
          void run(() => api.setEnabled(connection.id, !connection.enabled))
        }
        onCheck={(connection) => void run(() => api.check(connection.id))}
        onSignIn={(connection) => void model.signIn(connection.id)}
        onCancelSignIn={(connection) => void api.cancelSignIn(connection.id)}
        onSignOut={(connection) => void run(() => api.signOut(connection.id))}
        onRemove={(connection) => void remove(connection)}
      />
      <AddConnectionDialog
        open={adding}
        existingNames={connections?.map((connection) => connection.name) ?? []}
        onOpenChange={onAddingChange}
      />
    </>
  )
}
