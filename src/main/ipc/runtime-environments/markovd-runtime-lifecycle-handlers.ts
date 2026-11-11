import { ipcMain } from 'electron'
import type { MarkovdManagedRuntimeStatus } from '../../../shared/markovd-managed-runtime'
import { createManagedMarkovdEnvironment } from '../../managed-server/lifecycle/markovd-runtime-deployment'
import { getManagedMarkovdRuntimeStatus } from '../../managed-server/lifecycle/markovd-runtime-status'

export function registerMarkovdRuntimeLifecycleHandlers(options: {
  getUserDataPath: () => string
}): void {
  ipcMain.handle(
    'runtimeEnvironments:deployMarkovd',
    async (_event, args: { name: string; sshTargetId: string; force?: boolean }) =>
      createManagedMarkovdEnvironment(options.getUserDataPath(), {
        name: requiredString(args?.name, 'Server name'),
        sshTargetId: requiredString(args?.sshTargetId, 'SSH target'),
        force: args?.force === true
      })
  )
  ipcMain.handle(
    'runtimeEnvironments:getMarkovdStatus',
    (_event, args: { selector: string }): Promise<MarkovdManagedRuntimeStatus> =>
      getManagedMarkovdRuntimeStatus(
        options.getUserDataPath(),
        requiredString(args?.selector, 'Server')
      )
  )
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required.`)
  }
  return value.trim()
}
