import { isOfferedTuiAgent } from '../../../shared/agent-launch/catalog/offered-tui-agents'
import { TUI_AGENT_FAVICON_DOMAINS } from '../../../shared/agent-launch/catalog/tui-agent-favicon-domains'
import { primaryAgentCatalogEntries } from './agent-catalog-entries-primary'
import { secondaryAgentCatalogEntries } from './agent-catalog-entries-secondary'
import type { AgentCatalogEntry } from './agent-catalog'

export function buildAgentCatalogEntries(): AgentCatalogEntry[] {
  return [...primaryAgentCatalogEntries(), ...secondaryAgentCatalogEntries()]
    .filter((entry) => isOfferedTuiAgent(entry.id))
    .map((entry) => {
      const faviconDomain = TUI_AGENT_FAVICON_DOMAINS[entry.id]
      return faviconDomain ? { ...entry, faviconDomain } : entry
    })
}
