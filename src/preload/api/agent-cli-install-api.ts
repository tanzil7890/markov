import type {
  AgentCliInstallAgent,
  AgentCliInstallProgress,
  AgentCliInstallResult
} from '../../shared/agent-cli-install-types'

export type AgentCliInstallApi = {
  /** True where main can install agents without a terminal (macOS and Linux). */
  isSupported: () => Promise<boolean>
  install: (agent: AgentCliInstallAgent) => Promise<AgentCliInstallResult>
  onProgress: (callback: (progress: AgentCliInstallProgress) => void) => () => void
}
