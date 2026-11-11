import { ipcMain } from 'electron'
import { registerManagedServerActions } from '../../runtime/managed-server-actions-registry'
import {
  createManagedMarkovdActions,
  reclaimManagedMarkovdStaleLock,
  restartManagedMarkovd,
  type ManagedMarkovdActionOptions
} from './managed-markovd-actions'
import { requiredString } from './markovd-runtime-lifecycle-handlers'

export function registerMarkovdRuntimeMaintenanceHandlers(
  options: ManagedMarkovdActionOptions
): void {
  const actions = createManagedMarkovdActions(options)
  // CLI runtime RPC uses these same managedServer actions.
  registerManagedServerActions(actions)
  ipcMain.handle(
    'runtimeEnvironments:updateMarkovd',
    async (
      _event,
      args: {
        selector: string
        force?: boolean
        pastLiveTerminals?: { incumbentVersion?: unknown }
      }
    ) => {
      const incumbentVersion = args?.pastLiveTerminals?.incumbentVersion
      const pastLiveTerminals =
        args?.pastLiveTerminals &&
        (typeof incumbentVersion === 'string' || incumbentVersion === null)
          ? { incumbentVersion }
          : undefined
      return actions.update(
        requiredString(args?.selector, 'Server'),
        args?.force === true,
        pastLiveTerminals
      )
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:rollbackMarkovd',
    async (_event, args: { selector: string }) =>
      actions.rollback(requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:recoverMarkovd',
    async (_event, args: { selector: string; acceptChangedState?: boolean }) =>
      actions.recover(requiredString(args?.selector, 'Server'), args?.acceptChangedState === true)
  )
  ipcMain.handle('runtimeEnvironments:restartMarkovd', async (_event, args: { selector: string }) =>
    restartManagedMarkovd(options, requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:reclaimMarkovdStaleLock',
    async (_event, args: { selector: string; yes?: boolean; expectNonce?: string }) =>
      reclaimManagedMarkovdStaleLock(
        options,
        requiredString(args?.selector, 'Server'),
        // A confirmation without the checked record's nonce could clear a lock written since.
        args?.yes === true
          ? { yes: true, expectNonce: requiredString(args.expectNonce, 'The checked lock') }
          : { yes: false }
      )
  )
  ipcMain.handle('runtimeEnvironments:stopMarkovd', async (_event, args: { selector: string }) =>
    actions.stop(requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle(
    'runtimeEnvironments:cancelMarkovdStop',
    async (_event, args: { selector: string }) =>
      actions.cancelStop(requiredString(args?.selector, 'Server'))
  )
  ipcMain.handle('runtimeEnvironments:forgetMarkovd', async (_event, args: { selector: string }) =>
    actions.forget(requiredString(args?.selector, 'Server'))
  )
}
