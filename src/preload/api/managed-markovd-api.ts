/** Managed markovd servers over SSH; desktop-only, so web clients leave it undefined. */
import { ipcRenderer } from 'electron'
import type {
  MarkovdDeltaMovePreview,
  MarkovdDeltaMoveResult,
  MarkovdManagedCancelStopResult,
  MarkovdManagedConversionResult,
  MarkovdManagedDeployResult,
  MarkovdManagedForgetResult,
  MarkovdManagedPastLiveTerminals,
  MarkovdManagedPendingMigrationRow,
  MarkovdManagedRecoveryResult,
  MarkovdManagedRestartResult,
  MarkovdManagedStaleLockReclaimRequest,
  MarkovdManagedStaleLockReclaimResult,
  MarkovdManagedRollbackResult,
  MarkovdManagedRuntimeStatus,
  MarkovdManagedStopResult
} from '../../shared/markovd-managed-runtime'
import type { PublicKnownRuntimeEnvironment } from '../../shared/remote-runtime/host-catalog/runtime-environments'
import type {
  RuntimeSshAccessLinkRequest,
  RuntimeSshAccessUnlinkRequest
} from '../../shared/runtime-ssh-access'

export type ManagedMarkovdPreloadApi = {
  deploy: (args: {
    name: string
    sshTargetId: string
    force?: boolean
  }) => Promise<MarkovdManagedDeployResult>
  getStatus: (args: { selector: string }) => Promise<MarkovdManagedRuntimeStatus>
  update: (args: {
    selector: string
    force?: boolean
    pastLiveTerminals?: MarkovdManagedPastLiveTerminals
  }) => Promise<MarkovdManagedDeployResult>
  rollback: (args: { selector: string }) => Promise<MarkovdManagedRollbackResult>
  recover: (args: {
    selector: string
    /** Restore the snapshot over state a rejected build changed; see MARKOVD_RECOVERY_CHANGED_STATE_CODE. */
    acceptChangedState?: boolean
  }) => Promise<MarkovdManagedRecoveryResult>
  /** Restarts from this client's SSH session; refused while terminals run. */
  restart: (args: { selector: string }) => Promise<MarkovdManagedRestartResult>
  /** Without `yes`, only reports whether the host's instance lock may be cleared. */
  reclaimStaleLock: (
    args: { selector: string } & MarkovdManagedStaleLockReclaimRequest
  ) => Promise<MarkovdManagedStaleLockReclaimResult>
  stop: (args: { selector: string }) => Promise<MarkovdManagedStopResult>
  cancelStop: (args: { selector: string }) => Promise<MarkovdManagedCancelStopResult>
  forget: (args: { selector: string }) => Promise<MarkovdManagedForgetResult>
  linkSshAccess: (args: RuntimeSshAccessLinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  unlinkSshAccess: (args: RuntimeSshAccessUnlinkRequest) => Promise<PublicKnownRuntimeEnvironment>
  convertSshHost: (args: {
    sshTargetId: string
    name: string
  }) => Promise<MarkovdManagedConversionResult>
  listPendingMigrations: () => Promise<MarkovdManagedPendingMigrationRow[]>
  previewDeltaMove: (args: { sshTargetId: string }) => Promise<MarkovdDeltaMovePreview>
  moveDelta: (args: { sshTargetId: string }) => Promise<MarkovdDeltaMoveResult>
  keepServerVersion: (args: { sshTargetId: string }) => Promise<void>
  /** "Move anyway": the next connect leaves what can't move on this desktop. */
  allowMoveLeavingBehind: (args: { sshTargetId: string }) => Promise<void>
}

export const managedMarkovdApi: ManagedMarkovdPreloadApi = {
  deploy: (args) => ipcRenderer.invoke('runtimeEnvironments:deployMarkovd', args),
  getStatus: (args) => ipcRenderer.invoke('runtimeEnvironments:getMarkovdStatus', args),
  update: (args) => ipcRenderer.invoke('runtimeEnvironments:updateMarkovd', args),
  rollback: (args) => ipcRenderer.invoke('runtimeEnvironments:rollbackMarkovd', args),
  recover: (args) => ipcRenderer.invoke('runtimeEnvironments:recoverMarkovd', args),
  restart: (args) => ipcRenderer.invoke('runtimeEnvironments:restartMarkovd', args),
  reclaimStaleLock: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:reclaimMarkovdStaleLock', args),
  stop: (args) => ipcRenderer.invoke('runtimeEnvironments:stopMarkovd', args),
  cancelStop: (args) => ipcRenderer.invoke('runtimeEnvironments:cancelMarkovdStop', args),
  forget: (args) => ipcRenderer.invoke('runtimeEnvironments:forgetMarkovd', args),
  linkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:linkSshAccess', args),
  unlinkSshAccess: (args) => ipcRenderer.invoke('runtimeEnvironments:unlinkSshAccess', args),
  convertSshHost: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:convertSshHostToManagedMarkovd', args),
  listPendingMigrations: () =>
    ipcRenderer.invoke('runtimeEnvironments:listPendingMarkovdMigrations'),
  previewDeltaMove: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:previewMarkovdDeltaMove', args),
  moveDelta: (args) => ipcRenderer.invoke('runtimeEnvironments:moveMarkovdDelta', args),
  keepServerVersion: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:keepMarkovdServerVersion', args),
  allowMoveLeavingBehind: (args) =>
    ipcRenderer.invoke('runtimeEnvironments:allowMarkovdMoveLeavingBehind', args)
}
