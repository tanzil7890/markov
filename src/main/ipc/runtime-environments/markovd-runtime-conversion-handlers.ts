import { ipcMain } from 'electron'
import type {
  MarkovdManagedConversionResult,
  MarkovdManagedPendingMigrationRow
} from '../../../shared/markovd-managed-runtime'
import { listPendingManagedMarkovdMigrations } from '../../managed-server/lifecycle/markovd-managed-migration-status'
import { convertSshTargetToManagedMarkovd } from '../../managed-server/lifecycle/markovd-runtime-conversion'
import { conversionCollaborators } from '../../managed-server/lifecycle/markovd-runtime-conversion-wiring'
import { requiredString } from './markovd-runtime-lifecycle-handlers'

export function registerMarkovdRuntimeConversionHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(
    'runtimeEnvironments:convertSshHostToManagedMarkovd',
    (
      _event,
      args: { sshTargetId: string; name: string }
    ): Promise<MarkovdManagedConversionResult> => {
      return convertSshTargetToManagedMarkovd(getUserDataPath(), {
        sshTargetId: requiredString(args?.sshTargetId, 'SSH target'),
        name: requiredString(args?.name, 'Server name'),
        ...conversionCollaborators()
      })
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:listPendingMarkovdMigrations',
    (): MarkovdManagedPendingMigrationRow[] =>
      listPendingManagedMarkovdMigrations(getUserDataPath())
  )
}
