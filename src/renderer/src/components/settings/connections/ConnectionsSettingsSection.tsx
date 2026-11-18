import { useState } from 'react'
import { Plus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import type { SettingsSearchEntry } from '../search/settings-search'
import { SettingsSection } from '../section-layout/SettingsSection'
import { ConnectionsPane } from './ConnectionsPane'
import { useMcpConnections } from './use-mcp-connections'

type ConnectionsSettingsSectionProps = {
  mounted: boolean
  /** MCP connections belong to this computer; another host's settings cannot change them. */
  localHost: boolean
  searchEntries: SettingsSearchEntry[]
}

/** The MCP tab of Settings → Connections. */
export function ConnectionsSettingsSection({
  mounted,
  localHost,
  searchEntries
}: ConnectionsSettingsSectionProps): React.JSX.Element {
  const [adding, setAdding] = useState(false)
  // Why here, above the section: the list and its open rows survive a visit to another tab.
  const connections = useMcpConnections(mounted && localHost)
  return (
    <SettingsSection
      id="connections"
      title={translate('settings.connections.mcpTitle', 'MCP servers')}
      description={translate(
        'settings.connections.description',
        'Connect MCP servers once and use their tools from every agent.'
      )}
      searchEntries={searchEntries}
      headerAction={
        localHost ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            {translate('settings.connections.add', 'Add connection')}
          </Button>
        ) : null
      }
    >
      {!mounted ? null : localHost ? (
        <ConnectionsPane model={connections} adding={adding} onAddingChange={setAdding} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {translate(
            'settings.connections.localOnly',
            'Connections are set up on this computer. Choose this computer above to manage them.'
          )}
        </p>
      )}
    </SettingsSection>
  )
}
