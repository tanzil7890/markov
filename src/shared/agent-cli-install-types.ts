export const AGENT_CLI_INSTALL_PROGRESS_CHANNEL = 'agentCliInstall:progress'

/** Agents onboarding can install with one click. */
export type AgentCliInstallAgent = 'claude' | 'codex'

export type AgentCliInstallProgress = {
  agent: AgentCliInstallAgent
  stage: 'downloading' | 'installing'
  /** 0–100 while the size is known; null when the step reports no progress. */
  percent: number | null
}

export type AgentCliInstallResult =
  | { ok: true; version: string | null }
  | { ok: false; error: string }

export function isAgentCliInstallAgent(value: unknown): value is AgentCliInstallAgent {
  return value === 'claude' || value === 'codex'
}
