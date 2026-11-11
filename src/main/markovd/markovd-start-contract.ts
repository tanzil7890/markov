import type { ServeReadiness } from '../server/serve-readiness'
import type { MarkovdManagedStopContext } from '../../shared/markovd-stop-request'

export type MarkovdOptions = {
  port?: number
  json?: boolean
  noPairing?: boolean
  pairingAddress?: string
  /** Request a mobile-scoped pairing offer and terminal QR. */
  mobilePairing?: boolean
  grantDesktopControl?: boolean
  /** Print only the ephemeral-VM recipe line. */
  recipeJson?: boolean
  projectRoot?: string
  bind?: string
  /** Slots have no browser client; markov serve supplies the installed app client. */
  webClientRoot?: string
}

export type MarkovdHandle = {
  readiness: ServeReadiness
  managedStop: MarkovdManagedStopContext
  stop(): Promise<void>
}
