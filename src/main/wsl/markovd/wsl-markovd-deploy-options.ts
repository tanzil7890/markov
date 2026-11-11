import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import type { MarkovdUpdateIntent } from '../../managed-server/lifecycle/markovd-managed-update-decision'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import type { WslDistroHolder } from '../discovery/wsl-distro-holder-types'
import type { WslMarkovdHostTarget } from './wsl-markovd-host-target'
import type { readWslMarkovdIncumbent } from './wsl-markovd-incumbent'

export type WslMarkovdDeployOptions = {
  /** The WSL environment's id; keys host-scoped state (wake dedupe). Defaults per distro. */
  environmentId?: string
  label?: string
  /** Defaults to a connect. */
  intent?: MarkovdUpdateIntent
  signal?: AbortSignal
  /** Defaults to one created over `userData`; the app should pass its shared instance. */
  holder?: WslDistroHolder
  createTransport?: (target: WslMarkovdHostTarget) => MarkovdHostTransport & { dispose?(): void }
  readRegistryId?: (distro: string) => Promise<string | null>
  readIncumbent?: typeof readWslMarkovdIncumbent
  /** This desktop's enrolled pairing, which the incumbent's terminal count authenticates with. */
  pairedOffer?: PairingOffer | null
  /** The markovd template to deploy from; defaults to the packaged one (the C10 lane swaps it). */
  templateDir?: string
  /** A no-boot connect's running check (E9), re-read before any further wake. */
  requireRunning?: () => Promise<boolean>
}
