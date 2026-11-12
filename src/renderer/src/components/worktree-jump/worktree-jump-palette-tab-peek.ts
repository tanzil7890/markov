import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'

const PEEK_MAX_LENGTH = 200

/** The agent's latest reply in a tab, as one plain line; the same text the sidebar shows under a chat. */
export function getPaletteTabPeekText(
  agentStatusByPaneKey: Readonly<Record<string, AgentStatusEntry>>,
  tabIds: readonly string[]
): string | null {
  let latest: AgentStatusEntry | null = null
  for (const [paneKey, entry] of Object.entries(agentStatusByPaneKey)) {
    const tabId = parsePaneKey(paneKey)?.tabId
    if (!tabId || !tabIds.includes(tabId) || !entry.lastAssistantMessage?.trim()) {
      continue
    }
    if (!latest || entry.updatedAt > latest.updatedAt) {
      latest = entry
    }
  }
  const firstLine = latest?.lastAssistantMessage
    ?.split('\n')
    .map((line) => line.replace(/[`*]/g, '').trim())
    .find(Boolean)
  return firstLine ? firstLine.slice(0, PEEK_MAX_LENGTH) : null
}
