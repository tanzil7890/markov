export type OnboardingSetupAgent = 'claude' | 'codex'

export type AgentCliInstallPlan = {
  command: string
  /** Shell the command is written for; omitted when the user's default shell runs it. */
  shellOverride?: string
}

/** Each vendor's documented install command for this OS. */
export function getAgentCliInstallPlan(
  agent: OnboardingSetupAgent,
  platform: 'darwin' | 'linux' | 'win32'
): AgentCliInstallPlan {
  if (agent === 'claude') {
    return platform === 'win32'
      ? { command: 'irm https://claude.ai/install.ps1 | iex', shellOverride: 'powershell.exe' }
      : { command: 'curl -fsSL https://claude.ai/install.sh | bash' }
  }
  return { command: 'npm install -g @openai/codex' }
}
