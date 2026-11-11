import type { ServeReadiness } from '../server/serve-readiness'
import type { MarkovRuntimeRpcServer } from '../runtime/rpc/server/runtime-rpc'
import { buildServePairingReadiness } from '../server/serve-pairing-readiness'
import type { MarkovdHealth } from './markovd-health'
import type { MarkovdOptions } from './markovd-start-contract'

export async function buildMarkovdServeReadiness(input: {
  options: MarkovdOptions
  runtimeId: string
  rpc: Pick<MarkovRuntimeRpcServer, 'getWebSocketEndpoint' | 'createPairingOffer'>
  collectHealth: () => Promise<MarkovdHealth>
}): Promise<ServeReadiness> {
  return {
    runtimeId: input.runtimeId,
    ...(await buildServePairingReadiness(input.options, input.rpc)),
    // WSL CLI reconciliation runs only in desktop launch, so no repair is pending here.
    managedWslCliReconciliation: 'settled',
    // Deployers inspect readiness health to reject hosts whose terminal daemon is unavailable.
    health: await input.collectHealth()
  }
}
