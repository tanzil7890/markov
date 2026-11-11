/** E1: open a temporary bridge for incumbent census before activation. Unproven state is unverifiable, never zero; WSL has no standing deploy tunnel. */
import { pairedRuntimeConnectionFromOffer } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'
import type { PairingOffer } from '../../../shared/remote-runtime/pairing/mobile-relay-pairing-offer'
import { MARKOVD_MANAGED_REMOTE_PORT } from '../../../shared/markovd-managed-runtime'
import {
  type MarkovdTerminalCensus,
  UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
} from '../../../shared/markovd-terminal-census'
import type { ServeReadiness } from '../../server/serve-readiness'
import { probeActiveMarkovdReadiness } from '../../ssh/markovd-active-readiness'
import { markovdBoundPort } from '../../managed-server/lifecycle/markovd-managed-bound-port'
import { managedMarkovdInstallDir } from '../../managed-server/lifecycle/markovd-managed-runtime-context'
import { wakeStoppedManagedMarkovd } from '../../managed-server/lifecycle/markovd-managed-wake'
import type { MarkovdRemoteContext } from '../../managed-server/install/markovd-remote-context'
import type { MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import { readRemoteMarkovdBuildHash } from '../../managed-server/install/markovd-remote-build-hash'
import {
  requestMarkovdTerminalCensus,
  type MarkovdTerminalCensusRequestOptions
} from '../../ssh/markovd-terminal-census-client'
import { updateTerminalCounts } from '../../ssh/markovd-fenced-stop'
import { tunneledMarkovdPairingCode } from '../../ssh/markovd-tunneled-pairing'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import type { WslMarkovdHostTarget } from './wsl-markovd-host-target'
import { listenWslMarkovdStdioBridge } from './wsl-markovd-stdio-bridge'

export type WslMarkovdIncumbent = {
  census: MarkovdTerminalCensus
  /** The incumbent's proven readiness; null when it could not be started or proven. */
  readiness: ServeReadiness | null
  /** Recount without wake and close terminal admission before activation stops the incumbent; unreadable never means zero. */
  recount: () => Promise<MarkovdTerminalCensus>
  /** Reopens the admission `recount` closed, when the incumbent keeps running. */
  releaseAdmission: () => Promise<void>
}

type IncumbentArgs = {
  context: MarkovdRemoteContext<WslMarkovdHostTarget>
  slot: MarkovdSlotOptions
  /** This desktop's enrolled pairing; null before its first pairing. */
  paired?: PairingOffer | null
}

const UNREADABLE: WslMarkovdIncumbent = {
  census: UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS,
  readiness: null,
  recount: async () => UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS,
  releaseAdmission: async () => {}
}

export type WslMarkovdIncumbentDependencies = {
  wake: typeof wakeStoppedManagedMarkovd
  probe: typeof probeActiveMarkovdReadiness
  readBuildHash: typeof readRemoteMarkovdBuildHash
  listen: (
    transport: MarkovdHostTransport,
    remotePort: number,
    target: WslMarkovdHostTarget
  ) => Promise<StartedPortForward>
  census: typeof requestMarkovdTerminalCensus
}

const DEFAULT_DEPENDENCIES: WslMarkovdIncumbentDependencies = {
  wake: wakeStoppedManagedMarkovd,
  probe: probeActiveMarkovdReadiness,
  readBuildHash: readRemoteMarkovdBuildHash,
  listen: (transport, remotePort, target) =>
    listenWslMarkovdStdioBridge(transport, {
      environmentId: target.id,
      distro: target.distro,
      remotePort,
      localPort: 0,
      label: `Markov server in WSL: ${target.label} (update check)`
    }),
  census: requestMarkovdTerminalCensus
}

/** Wake reboot/idle-stopped incumbent, census its daemon, then close the temporary bridge before returning. */
export async function readWslMarkovdIncumbent(
  args: IncumbentArgs,
  dependencies: WslMarkovdIncumbentDependencies = DEFAULT_DEPENDENCIES
): Promise<WslMarkovdIncumbent> {
  const record = args.context.activationRecord
  const activatedAt = record.activatedAt ? Date.parse(record.activatedAt) : Number.NaN
  if (!record.active || !Number.isFinite(activatedAt) || activatedAt < 0) {
    return UNREADABLE
  }
  let readiness: ServeReadiness
  try {
    const wake = await dependencies.wake(args.slot)
    if (wake.outcome === 'started') {
      readiness = wake.readiness
    } else if (wake.outcome === 'serving') {
      const remoteInstallDir = managedMarkovdInstallDir(args.context, record.active)
      readiness = await dependencies.probe(
        { ...args.slot, remoteInstallDir },
        {
          buildHash: await dependencies.readBuildHash(args.slot, remoteInstallDir),
          fullVersion: record.active
        }
      )
    } else {
      return UNREADABLE
    }
  } catch {
    return UNREADABLE
  }
  const counts = updateTerminalCounts((options) =>
    countIncumbentTerminals(args, readiness, activatedAt, dependencies, options)
  )
  return {
    census: await counts.countFirst(),
    readiness,
    recount: counts.recountCensus,
    releaseAdmission: counts.releaseIncumbentAdmission
  }
}

async function countIncumbentTerminals(
  args: IncumbentArgs,
  readiness: ServeReadiness,
  activatedAt: number,
  dependencies: WslMarkovdIncumbentDependencies,
  options: MarkovdTerminalCensusRequestOptions
): Promise<MarkovdTerminalCensus> {
  let forward: StartedPortForward | null = null
  try {
    forward = await dependencies.listen(
      args.slot.conn,
      markovdBoundPort(readiness) ?? MARKOVD_MANAGED_REMOTE_PORT,
      args.context.target
    )
    // Use enrolled grants; startup offers would enroll a fresh device on every census.
    const offer = parsePairingCode(
      tunneledMarkovdPairingCode(readiness, forward.entry.localPort, args.paired)
    )
    if (!offer) {
      return UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
    }
    return await dependencies.census(
      pairedRuntimeConnectionFromOffer(offer),
      activatedAt,
      undefined,
      options
    )
  } catch {
    return UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
  } finally {
    await forward?.close().catch(() => {})
  }
}
