import { feedAgentSessionStats, type AgentStatusSource } from '../stats/agent-session-stats-feed'
import { initStatsPath, StatsCollector } from '../stats/collector'
import type { MarkovdRuntimeCleanup } from './markovd-runtime-lifetime'

export function startMarkovdStats(
  userDataPath: string,
  hooks: AgentStatusSource,
  registerCleanup: (cleanup: MarkovdRuntimeCleanup) => void
): StatsCollector {
  initStatsPath(userDataPath)
  const stats = new StatsCollector()
  // Reverse cleanup order stops feeds/RPC before the final stats flush.
  registerCleanup(() => stats.flushAsync())
  registerCleanup(feedAgentSessionStats(stats, hooks))
  return stats
}
