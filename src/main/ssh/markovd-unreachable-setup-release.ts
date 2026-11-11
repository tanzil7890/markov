/** Release conversion setups stranded before staging by refused SSH forwarding. Stop any activated slot, unregister, then use undeployed-fence release; source rows remain intact for retry. */
import { listEnvironments } from '../../shared/remote-runtime/host-store/runtime-environment-store'
import { removeManagedMarkovdEnvironment } from '../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import { findMarkovdMigrationSourceCutoverForTarget } from './markovd-migration-cutover-journal'
import { releaseUndeployedMigrationFence } from './markovd-migration-source-fence'
import { closeMarkovdManagedTunnel } from '../managed-server/lifecycle/markovd-managed-tunnel'
import type { SshTargetMarkovdClaims } from './targets/ssh-target-markovd-claims'
import { withMarkovdActivationLock } from '../managed-server/activation/markovd-activation-lock'
import { withDeactivatedVersionCommitted } from '../managed-server/activation/markovd-activation-record'
import {
  readMarkovdActivationRecord,
  writeMarkovdActivationRecord
} from '../managed-server/activation/markovd-activation-record-store'
import { managedMarkovdSlot } from '../managed-server/lifecycle/markovd-managed-runtime-context'
import { resolveMarkovdRemoteContext } from '../managed-server/install/markovd-remote-context'
import { markovdStopFreedTheHost } from '../managed-server/install/markovd-remote-process-control'
import { markovdSlotDir, stopMarkovdSlot } from './markovd-recovery-slot'
import { sshMarkovdHostTransport } from './markovd-ssh-host-transport'
import { getSshConnectionManager, getSshTargetRegistryStore } from './targets/ssh-target-registry'
import { errorMessage } from '../../shared/error-message'

export async function releaseUnreachableMarkovdSetup(args: {
  userDataPath: string
  claims: SshTargetMarkovdClaims
  targetId: string
  signal?: AbortSignal
}): Promise<void> {
  const cutover = findMarkovdMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  // Staged/committed destinations require their own evidence before release.
  if (cutover?.phase !== 'source-fenced') {
    return
  }
  const environmentId = cutover.destinationEnvironmentId
  await closeMarkovdManagedTunnel(environmentId).catch(() => undefined)
  await stopStrandedMarkovd(args.targetId, args.signal).catch((error: unknown) => {
    console.warn(`[markovd] Could not stop the unreachable setup's server: ${errorMessage(error)}`)
  })
  const isRegistered = (id: string): boolean =>
    listEnvironments(args.userDataPath).some((entry) => entry.id === id)
  // Unregister first so an interrupted release leaves a recoverable undeployed fence.
  if (isRegistered(environmentId)) {
    removeManagedMarkovdEnvironment(args.userDataPath, environmentId)
  }
  await releaseUndeployedMigrationFence({
    userDataPath: args.userDataPath,
    claims: args.claims,
    targetId: args.targetId,
    isDestinationRegistered: isRegistered,
    signal: args.signal
  })
}

/** Clear active only after proven slot exit; daemon terminals may outlive it. */
async function stopStrandedMarkovd(targetId: string, signal?: AbortSignal): Promise<void> {
  const target = getSshTargetRegistryStore()?.getTarget(targetId)
  const connectionManager = getSshConnectionManager()
  if (!target || !connectionManager) {
    return
  }
  const context = await resolveMarkovdRemoteContext(
    target,
    sshMarkovdHostTransport(await connectionManager.connect(target)),
    signal
  )
  if (!context.activationRecord.active) {
    return
  }
  // Port is irrelevant because this recovery never launches a slot.
  const slot = managedMarkovdSlot(context, 0, signal)
  await withMarkovdActivationLock(
    slot,
    async () => {
      const record = await readMarkovdActivationRecord(slot)
      if (!record.active) {
        return
      }
      const stopped = await stopMarkovdSlot(slot, markovdSlotDir(slot, record.active), false)
      if (markovdStopFreedTheHost(stopped)) {
        await writeMarkovdActivationRecord(slot, withDeactivatedVersionCommitted(record))
      }
    },
    () => undefined
  )
}
