import { isOfferedUsageProvider } from '../../../../shared/agent-launch/catalog/offered-usage-trackers'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { StatusBarItem } from '../../../../shared/ui-chrome-types'

// Hide missing CLI items and toggles after detection; unknown detection preserves them to avoid cold-start flicker.
const CLI_GATED_ITEMS: ReadonlySet<StatusBarItem> = new Set([
  'claude',
  'codex',
  'gemini',
  'kimi',
  'antigravity',
  'grok',
  'zcode'
])

/** False for a usage meter whose agent or tracker is withheld, whatever is installed or saved. */
export function isStatusBarItemOffered(id: StatusBarItem): boolean {
  return id === 'ssh' || id === 'resource-usage' || id === 'ports' || isOfferedUsageProvider(id)
}

export function isStatusBarItemAvailable(
  id: StatusBarItem,
  detectedAgentIds: TuiAgent[] | null
): boolean {
  if (!isStatusBarItemOffered(id)) {
    return false
  }
  if (!CLI_GATED_ITEMS.has(id)) {
    return true
  }
  if (detectedAgentIds === null) {
    return true
  }
  return detectedAgentIds.includes(id as TuiAgent)
}
