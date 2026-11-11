import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { ServeReadiness } from '../../server/serve-readiness'
import {
  markovdIdentityRefusal,
  verifyMarkovdPairingIdentity,
  type MarkovdTunnelIdentity
} from '../../managed-server/lifecycle/markovd-managed-tunnel-identity'
import { tunneledMarkovdPairingCode } from '../../ssh/markovd-tunneled-pairing'
import { getPreferredPairingOffer } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import {
  buildWithPairingRepair,
  type ManagedMarkovdPairingRecovery
} from '../../managed-server/lifecycle/markovd-managed-tunnel-pairing-recovery'
import type { WslMarkovdLaunch } from './wsl-markovd-deploy'

/** The managed repair gate a refused enrolled token goes through, for one WSL host. */
export type WslMarkovdPairingRecovery = Omit<ManagedMarkovdPairingRecovery, 'ensure'> & {
  environmentId: string
}

/** Reconnect with enrolled token/pinned host key. Repair refusal once through the gate and verify the replacement; startup offers are for enrollment only. */
export async function resolveWslMarkovdPairing(
  launch: Extract<WslMarkovdLaunch, { outcome: 'ready' }>,
  localPort: number,
  paired: PairingOffer | null,
  verifyIdentity = verifyWslMarkovdIdentity,
  recovery?: WslMarkovdPairingRecovery
): Promise<string> {
  const verified = (offer: PairingOffer | null) =>
    verifyWslMarkovdPairing(launch, localPort, offer, verifyIdentity)
  // First-time pairing has no enrolled token to repair.
  if (!recovery || !paired) {
    return verified(paired)
  }
  let pairingOffer = ''
  await buildWithPairingRepair(
    {
      ...recovery,
      ensure: async (environment) => {
        pairingOffer = await verified(getPreferredPairingOffer(environment))
      }
    },
    recovery.environmentId,
    async () => {
      pairingOffer = await verified(paired)
    }
  )
  return pairingOffer
}

async function verifyWslMarkovdPairing(
  launch: Extract<WslMarkovdLaunch, { outcome: 'ready' }>,
  localPort: number,
  paired: PairingOffer | null,
  verifyIdentity: typeof verifyWslMarkovdIdentity
): Promise<string> {
  const pairingOffer = tunneledMarkovdPairingCode(launch.readiness, localPort, paired)
  const identity = await verifyIdentity(pairingOffer, launch.readiness)
  if (identity.verdict === 'foreign' || identity.verdict === 'unpaired') {
    throw markovdIdentityRefusal(launch.port, identity)
  }
  if (identity.verdict === 'unreachable') {
    console.warn(
      `[wsl] Markov server in ${launch.distro} did not answer its bridge: ${identity.detail}`
    )
  }
  return pairingOffer
}

/** Whether the server behind a WSL bridge is the markovd that published `readiness`. */
export async function verifyWslMarkovdIdentity(
  pairingOffer: string,
  readiness: ServeReadiness
): Promise<MarkovdTunnelIdentity> {
  const offer = parsePairingCode(pairingOffer)
  return offer
    ? verifyMarkovdPairingIdentity(pairedRuntimeConnectionFromOffer(offer), {
        runtimeId: readiness.runtimeId || null
      })
    : { verdict: 'foreign', detail: 'The Markov server in WSL published an invalid pairing offer.' }
}
