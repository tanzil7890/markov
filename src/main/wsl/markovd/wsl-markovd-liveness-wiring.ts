/** C7 supplies visible demand; these production probes serve the WSL liveness supervisor. */
import {
  probeThenWatchWslMarkovdBridges,
  type WslMarkovdBridgeActivity
} from './wsl-markovd-bridge-activity'
import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import {
  type MarkovdTerminalCensus,
  UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
} from '../../../shared/markovd-terminal-census'
import { requestMarkovdTerminalCensus } from '../../ssh/markovd-terminal-census-client'
import { subscribeSystemPowerLifecycle } from '../../power/system-power-lifecycle'
import {
  deferUntilWslDistroRunning,
  readSettledConfirmedRunningWslDistros
} from '../discovery/wsl-background-distro-gate'
import type { WslDistroHolder } from '../discovery/wsl-distro-holder-types'
import { readWslGuestIdentity } from '../execution/wsl-guest-process-identity'
import type { WslMarkovdConnection } from './wsl-markovd-connection-types'
import type { WslMarkovdConnectionManager } from './wsl-markovd-connection'
import { defaultWslMarkovdEnvironmentId } from './wsl-markovd-deploy'
import { EXIT_SETTLE_MS } from './wsl-markovd-liveness-evidence'
import { requireConfirmedRunning } from './wsl-markovd-connection-errors'
import { WslMarkovdLivenessSupervisor } from './wsl-markovd-liveness-supervisor'
import { createWslMarkovdHostTransport } from './wsl-markovd-host-transport'
import { openWslMarkovdWatch } from './wsl-markovd-watch'

function transportFor(distro: string, environmentId = defaultWslMarkovdEnvironmentId(distro)) {
  return createWslMarkovdHostTransport({
    target: { kind: 'wsl', id: environmentId, distro, label: distro }
  })
}

/** Every session counts (activation time 0): liveness asks how many survived, not how new. */
function collectWslMarkovdCensus(connection: WslMarkovdConnection): Promise<MarkovdTerminalCensus> {
  const offer = parsePairingCode(connection.pairingOffer)
  return offer
    ? requestMarkovdTerminalCensus(pairedRuntimeConnectionFromOffer(offer), 0)
    : Promise.resolve(UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS)
}

export function createWslMarkovdLivenessSupervisor(options: {
  manager: WslMarkovdConnectionManager
  bridgeActivity: WslMarkovdBridgeActivity
  holder: WslDistroHolder
  hasUserVisibleWork: (distro: string) => boolean
}): WslMarkovdLivenessSupervisor {
  return new WslMarkovdLivenessSupervisor({
    manager: options.manager,
    readRunning: ({ distro, exitedAt, probedAfter }) => {
      const settled =
        exitedAt === null || exitedAt === undefined ? undefined : exitedAt + EXIT_SETTLE_MS
      return readSettledConfirmedRunningWslDistros(
        distro,
        probedAfter === undefined ? settled : Math.max(settled ?? -Infinity, probedAfter)
      )
    },
    readIdentity: (distro, markovdPid) => readWslGuestIdentity(transportFor(distro), markovdPid),
    openWatch: (connection) =>
      probeThenWatchWslMarkovdBridges(
        () =>
          openWslMarkovdWatch(
            transportFor(connection.distro, connection.environmentId),
            connection.remotePort
          ),
        options.bridgeActivity,
        connection.environmentId
      ),
    collectCensus: collectWslMarkovdCensus,
    hasUserVisibleWork: options.hasUserVisibleWork,
    deferUntilRunning: deferUntilWslDistroRunning,
    requireRunning: async (distro) =>
      requireConfirmedRunning(await readSettledConfirmedRunningWslDistros(distro), distro),
    // Liveness is background work: the holder may re-spawn only into a distro that runs (E9).
    ensureHolder: (distro) =>
      options.holder.ensureHeld(distro, {
        requireRunning: async () =>
          requireConfirmedRunning(await readSettledConfirmedRunningWslDistros(distro), distro)
      }),
    subscribePower: subscribeSystemPowerLifecycle
  })
}
