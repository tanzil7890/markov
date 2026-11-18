import type { ProviderRateLimits } from '../../rate-limit-types'
import { isOfferedTuiAgent } from './offered-tui-agents'
import type { TuiAgent } from './tui-agent'

type UsageProvider = ProviderRateLimits['provider']

/**
 * Usage trackers that have no agent CLI of their own, so the offered-agents record cannot
 * withhold them. `false` hides the tracker's account section, status bar meter and toggles, and
 * stops its background refresh; its fetcher, saved credentials and translations stay in place, so
 * flipping it back to `true` restores it everywhere. See docs/agents-md-refs/offered-agents.md.
 */
export const AGENTLESS_USAGE_TRACKER_OFFERED = {
  minimax: false
} satisfies Partial<Record<UsageProvider, boolean>>

type AgentlessUsageTracker = keyof typeof AGENTLESS_USAGE_TRACKER_OFFERED

/** The agent whose offer decides each of the other usage meters. */
const USAGE_PROVIDER_AGENT: Record<Exclude<UsageProvider, AgentlessUsageTracker>, TuiAgent> = {
  claude: 'claude',
  codex: 'codex',
  gemini: 'gemini',
  'opencode-go': 'opencode',
  kimi: 'kimi',
  grok: 'grok',
  antigravity: 'antigravity',
  cursor: 'cursor',
  zcode: 'zcode'
}

function isAgentlessUsageTracker(provider: UsageProvider): provider is AgentlessUsageTracker {
  return Object.hasOwn(AGENTLESS_USAGE_TRACKER_OFFERED, provider)
}

/** A usage meter is offered only while its agent, or its own entry above, is. */
export function isOfferedUsageProvider(provider: UsageProvider): boolean {
  return isAgentlessUsageTracker(provider)
    ? AGENTLESS_USAGE_TRACKER_OFFERED[provider]
    : isOfferedTuiAgent(USAGE_PROVIDER_AGENT[provider])
}
