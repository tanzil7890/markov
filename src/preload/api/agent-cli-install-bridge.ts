import { ipcRenderer } from 'electron'
import {
  AGENT_CLI_INSTALL_PROGRESS_CHANNEL as PROGRESS_CHANNEL,
  type AgentCliInstallProgress
} from '../../shared/agent-cli-install-types'
import type { PreloadApi } from '../api-types'

export const agentCliInstallApi = {
  isSupported: () => ipcRenderer.invoke('agentCliInstall:isSupported'),
  install: (agent) => ipcRenderer.invoke('agentCliInstall:install', agent),
  onProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: AgentCliInstallProgress): void =>
      callback(progress)
    ipcRenderer.on(PROGRESS_CHANNEL, listener)
    return () => ipcRenderer.removeListener(PROGRESS_CHANNEL, listener)
  }
} satisfies PreloadApi['agentCliInstall']
