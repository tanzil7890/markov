import { ipcRenderer } from 'electron'
import { MCP_CONNECTIONS_CHANGED_CHANNEL as CHANGED_CHANNEL } from '../../shared/mcp-connections'
import type { PreloadApi } from '../api-types'

export const mcpConnectionsApi = {
  list: () => ipcRenderer.invoke('mcpConnections:list'),
  add: (draft) => ipcRenderer.invoke('mcpConnections:add', draft),
  remove: (id) => ipcRenderer.invoke('mcpConnections:remove', id),
  setEnabled: (id, enabled) => ipcRenderer.invoke('mcpConnections:setEnabled', id, enabled),
  check: (id) => ipcRenderer.invoke('mcpConnections:check', id),
  tools: (id) => ipcRenderer.invoke('mcpConnections:tools', id),
  signIn: (id) => ipcRenderer.invoke('mcpConnections:signIn', id),
  cancelSignIn: (id) => ipcRenderer.invoke('mcpConnections:cancelSignIn', id),
  signOut: (id) => ipcRenderer.invoke('mcpConnections:signOut', id),
  onChanged: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on(CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(CHANGED_CHANNEL, listener)
  }
} satisfies PreloadApi['mcpConnections']
