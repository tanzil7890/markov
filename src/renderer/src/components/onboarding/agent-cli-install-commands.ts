import type { AgentCliInstallAgent } from '../../../../shared/agent-cli-install-types'

export type AgentCliInstallPlan = {
  command: string
  /** Shell the command is written for; omitted when the user's default shell runs it. */
  shellOverride?: string
}

/** Each vendor's documented install command for this OS, typed into a terminal the person runs. */
export function getAgentCliInstallPlan(
  agent: AgentCliInstallAgent,
  platform: 'darwin' | 'linux' | 'win32'
): AgentCliInstallPlan {
  if (agent === 'claude') {
    return platform === 'win32'
      ? { command: 'irm https://claude.ai/install.ps1 | iex', shellOverride: 'powershell.exe' }
      : { command: 'curl -fsSL https://claude.ai/install.sh | bash' }
  }
  return { command: 'npm install -g @openai/codex' }
}
