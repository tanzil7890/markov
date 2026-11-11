import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import type { MarkovdManagedServing } from './markovd-managed-serving'
import { verifyManagedTunnelServing } from './markovd-managed-tunnel'

/** Return unverifiable on failures rather than throwing. */
export function verifyMarkovdManagedServing(
  userDataPath: string,
  selector: string
): Promise<MarkovdManagedServing> {
  return Promise.resolve()
    .then(() => verifyManagedTunnelServing(resolveEnvironment(userDataPath, selector)))
    .catch((error: unknown) => ({ state: 'unverifiable', detail: String(error) }))
}
