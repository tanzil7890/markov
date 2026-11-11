import { createOrchestrationEnvironmentTransport } from '../ipc/runtime-environments/orchestration-environment-transport'
import type { RuntimeConstructionDependencies } from '../runtime/construction/runtime-construction-dependencies'
import type { MarkovRuntimeRpcServer } from '../runtime/rpc/server/runtime-rpc'

type PairedEnvironmentRuntimeOptions = Required<
  Pick<RuntimeConstructionDependencies, 'orchestrationEnvironmentTransport' | 'getPairedDeviceName'>
>

/** Runtime options for this host's pairings: the servers it dials and the devices paired to it. */
export function createMarkovdPairedEnvironmentOptions(): {
  runtimeOptions: PairedEnvironmentRuntimeOptions
  /** RPC owns the device registry and starts after the runtime. */
  bindRpc: (rpc: Pick<MarkovRuntimeRpcServer, 'getDeviceRegistry'>) => void
} {
  let rpc: Pick<MarkovRuntimeRpcServer, 'getDeviceRegistry'> | null = null
  return {
    runtimeOptions: {
      // A headless host is a Run home too; it places workers on its own paired servers (#36853).
      orchestrationEnvironmentTransport: createOrchestrationEnvironmentTransport(),
      getPairedDeviceName: (pairedDeviceId) =>
        rpc?.getDeviceRegistry()?.getDevice(pairedDeviceId)?.name ?? null
    },
    bindRpc: (server) => {
      rpc = server
    }
  }
}
