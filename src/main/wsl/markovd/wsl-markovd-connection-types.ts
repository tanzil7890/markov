import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { MarkovdTunnelIdentity } from '../../managed-server/lifecycle/markovd-managed-tunnel-identity'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import type { WslDistroHolder } from '../discovery/wsl-distro-holder-types'
import type { WslMarkovdConnectionStatus } from './wsl-markovd-connection-status'
import type { WslMarkovdDeferredUpdate, WslMarkovdLaunch } from './wsl-markovd-deploy'
import type { WslMarkovdDeployOptions } from './wsl-markovd-deploy-options'
import type { WslMarkovdHostTarget } from './wsl-markovd-host-target'
import type { WslMarkovdPairingRecovery } from './wsl-markovd-pairing-identity'
import type { WslMarkovdStdioBridgeOptions } from './wsl-markovd-stdio-bridge'

/** One open bridge to a distro's markovd, as the connection manager publishes it. */
export type WslMarkovdConnection = {
  distro: string
  environmentId: string
  /** The loopback port on this machine the pairing offer points at. */
  localPort: number
  /** markovd's port inside the distro. */
  remotePort: number
  fullVersion: string
  /** markovd's pid inside the distro, from its pid file; null when unreadable. */
  pid: number | null
  /** markovd's pairing code, with its endpoint rewritten to `ws://127.0.0.1:<localPort>`. */
  pairingOffer: string
  /** An app update the incumbent `fullVersion` is waiting to take (live terminals). */
  deferredUpdate: WslMarkovdDeferredUpdate | null
  close(): Promise<void>
}

export type WslMarkovdConnectionDependencies = {
  holder?: WslDistroHolder
  getPairingOffer?: (environmentId: string) => PairingOffer | null
  /** The bridge port the host's record saved: rebinding it keeps the pairing across app restarts. */
  recordedLocalPort?: (environmentId: string) => number | null
  deployAndLaunch?: (distro: string, options: WslMarkovdDeployOptions) => Promise<WslMarkovdLaunch>
  createTransport?: (target: WslMarkovdHostTarget) => MarkovdHostTransport
  listen?: (
    transport: MarkovdHostTransport,
    options: WslMarkovdStdioBridgeOptions
  ) => Promise<StartedPortForward>
  verifyIdentity?: (
    pairingOffer: string,
    readiness: ServeReadiness
  ) => Promise<MarkovdTunnelIdentity>
  /** Re-pairs a refused enrolled token; without it a refusal fails the connect. */
  pairingRecovery?: Omit<WslMarkovdPairingRecovery, 'environmentId'>
  /** A connection (re)opened, its offer changed, or its status moved; null once it closed. */
  onChange?: (
    distro: string,
    connection: WslMarkovdConnection | null,
    status: WslMarkovdConnectionStatus
  ) => void
}
