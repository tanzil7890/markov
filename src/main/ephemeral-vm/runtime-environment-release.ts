import type { EphemeralVmRuntimeRecord } from '../../shared/ephemeral-vm-runtimes'
import { removeManagedMarkovdEnvironment } from '../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import {
  listEnvironments,
  removeEnvironment
} from '../../shared/remote-runtime/host-store/runtime-environment-store'
import { getMarkovdSshDeployment } from '../../shared/remote-runtime/host-catalog/runtime-environments'

/** Remove destroyed VM servers so managed tunnels stop reconnecting. */
export async function releaseEphemeralVmRuntimeEnvironments(
  userDataPath: string,
  runtime: Pick<EphemeralVmRuntimeRecord, 'runtimeEnvironmentId' | 'sshTargetId'>,
  // Same retirement as a Settings removal, so the host's session partition and transport go too.
  retireRemovedEnvironment: (environmentId: string) => void
): Promise<void> {
  // Relay-era conversions may have recorded only the SSH target, not the server ID.
  const environments = listEnvironments(userDataPath).filter(
    (entry) =>
      entry.id === runtime.runtimeEnvironmentId ||
      (runtime.sshTargetId !== undefined &&
        getMarkovdSshDeployment(entry)?.sshTargetId === runtime.sshTargetId)
  )
  for (const environment of environments) {
    if (!environment.markovdDeployment) {
      removeEnvironment(userDataPath, environment.id)
      retireRemovedEnvironment(environment.id)
      continue
    }
    const { closeMarkovdManagedTunnel } =
      await import('../managed-server/lifecycle/markovd-managed-tunnel')
    await closeMarkovdManagedTunnel(environment.id).catch(() => undefined)
    removeManagedMarkovdEnvironment(userDataPath, environment.id)
    retireRemovedEnvironment(environment.id)
  }
}
