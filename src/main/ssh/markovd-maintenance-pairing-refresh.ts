import { refreshManagedMarkovdPairing } from '../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import { resolveEnvironment } from '../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  getMarkovdSshDeployment,
  getPreferredPairingOffer,
  type KnownRuntimeEnvironment
} from '../../shared/remote-runtime/host-catalog/runtime-environments'
import type { ServeReadiness } from '../server/serve-readiness'
import { tunneledMarkovdPairingCode } from './markovd-tunneled-pairing'

/** Saves the pairing a managed server published after an update, rollback or restart. */
export function refreshMaintainedMarkovdPairing(
  userDataPath: string,
  environmentId: string,
  readiness: ServeReadiness
): KnownRuntimeEnvironment {
  // Reuse the enrolled grant after restart so pairing cannot replace this desktop’s identity (#29042).
  // Re-read because census may have repaired pairing or moved the tunnel port meanwhile.
  const current = resolveEnvironment(userDataPath, environmentId)
  const localPort = getMarkovdSshDeployment(current)?.localPort
  if (localPort === undefined) {
    throw new Error('This server is no longer managed over SSH.')
  }
  const enrolled = getPreferredPairingOffer(current)
  const pairingCode = tunneledMarkovdPairingCode(readiness, localPort, enrolled)
  return refreshManagedMarkovdPairing(userDataPath, environmentId, pairingCode)
}
