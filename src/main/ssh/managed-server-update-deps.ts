import { getAppEnvironment } from '../../shared/app-environment'
import type { ManagedServerUpdateDeps } from './managed-server-update-check'
import { autoUpdateManagedMarkovdEnvironment } from '../managed-server/lifecycle/markovd-managed-auto-update'
import { requireManagedMarkovdTargetStore } from '../managed-server/lifecycle/markovd-managed-runtime-context'
import {
  markovdUpdateFailedThisLaunch,
  recordMarkovdUpdateFailedThisLaunch
} from '../managed-server/lifecycle/markovd-managed-update-failure-memory'

export function managedServerUpdateDeps(userDataPath: string): ManagedServerUpdateDeps {
  const registry = requireManagedMarkovdTargetStore()
  const appVersion = getAppEnvironment().getVersion()
  return {
    autoUpdate: (environmentId, options) =>
      autoUpdateManagedMarkovdEnvironment(userDataPath, { environmentId, appVersion, ...options }),
    // Re-read the store: caller snapshots may predate an overlapping check's failure.
    recordedUpdateFailure: (target) => {
      const failure = (registry.getTarget(target.id) ?? target).managedServerUpdateFailure
      return failure?.appVersion === appVersion ? failure.reason : null
    },
    // Only attempted failures suppress retry; keep launch-only state out of peer-published SshTarget.
    failedThisLaunch: (target) => markovdUpdateFailedThisLaunch({ kind: 'ssh', id: target.id }),
    recordUpdateFailure: (target, reason) => {
      recordMarkovdUpdateFailedThisLaunch(
        { kind: 'ssh', id: target.id },
        { code: 'markovd_update_failed', reason }
      )
      registry.updateTarget(target.id, { managedServerUpdateFailure: { reason, appVersion } })
    },
    clearUpdateFailure: (target) => {
      registry.updateTarget(target.id, { managedServerUpdateFailure: undefined })
    }
  }
}
