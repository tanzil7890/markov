import { ipcMain } from 'electron'
import {
  AGENT_CLI_INSTALL_PROGRESS_CHANNEL,
  isAgentCliInstallAgent,
  type AgentCliInstallResult
} from '../../shared/agent-cli-install-types'
import {
  isOneClickAgentInstallSupported,
  runAgentCliInstall
} from '../agent-cli-install/agent-cli-install-runner'

export function registerAgentCliInstallHandlers(): void {
  ipcMain.removeHandler('agentCliInstall:isSupported')
  ipcMain.removeHandler('agentCliInstall:install')

  ipcMain.handle('agentCliInstall:isSupported', (): boolean => isOneClickAgentInstallSupported())
  ipcMain.handle(
    'agentCliInstall:install',
    (event, agent: unknown): Promise<AgentCliInstallResult> | AgentCliInstallResult => {
      if (!isAgentCliInstallAgent(agent)) {
        return { ok: false, error: 'Markov can only install Claude Code or Codex this way.' }
      }
      return runAgentCliInstall(agent, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(AGENT_CLI_INSTALL_PROGRESS_CHANNEL, progress)
        }
      })
    }
  )
}
