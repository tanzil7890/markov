import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from '../search/settings-search-keywords'

export const getConnectionsPaneSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('settings.connections.mcpTitle', 'MCP servers'),
    description: translate(
      'settings.connections.description',
      'Connect MCP servers once and use their tools from every agent.'
    ),
    keywords: [
      ...translateSearchKeyword('settings.connections.keyword.mcp', 'mcp'),
      ...translateSearchKeyword('settings.connections.keyword.connections', 'connections'),
      ...translateSearchKeyword('settings.connections.keyword.server', 'server'),
      ...translateSearchKeyword('settings.connections.keyword.tools', 'tools'),
      ...translateSearchKeyword('settings.connections.keyword.connector', 'connector'),
      ...translateSearchKeyword('settings.connections.keyword.integration', 'integration'),
      ...translateSearchKeyword('settings.connections.keyword.signIn', 'sign in')
    ]
  }
])
