import { getAppEnvironment } from '../../shared/app-environment'
import type { RuntimeRpcClientActivity } from '../runtime/rpc/server/runtime-rpc-shutdown'
import type { MarkovdIdleExitEvidence } from './markovd-idle-exit-monitor'
import {
  activationFenceExists,
  createMarkovdIdleProbes,
  installMarkovdManagedIdleExit,
  resolveMarkovdManagedIdleExit,
  type MarkovdManagedIdleExitConfig,
  type MarkovdManagedIdleExitPorts
} from './markovd-managed-idle-exit'
import type { MarkovdDaemonRetirement } from './markovd-daemon-retirement'
import { recoverDaemonAfterCancelledIdleStop } from './markovd-idle-stop-daemon-recovery'
import {
  consumeMarkovdIdleStopRecord,
  discardMarkovdIdleStopRecord,
  writeMarkovdIdleStopRecord
} from './markovd-idle-stop-record'
import type { MarkovdShutdownTrigger } from './markovd-lifecycle'
import {
  idleStopMayReleaseWslHolder,
  requestMarkovdWslHolderRelease,
  withdrawMarkovdWslHolderRelease
} from './markovd-wsl-holder-release'
import type { MarkovdIdleStopRecord } from '../../shared/markovd-idle-exit'
import { getStructuredAgentSessionHost } from '../native-chat/agent-session-wire/host/structured-agent-session-registry'

let requestIdleShutdown: MarkovdShutdownTrigger | null = null

/** Signal handling binds later; the quiet period must outlast the startup gap. */
export function bindMarkovdIdleShutdown(request: MarkovdShutdownTrigger): void {
  requestIdleShutdown = request
}

type MarkovdIdleExitRuntimePorts = {
  rpc: { readClientActivity(): RuntimeRpcClientActivity }
  agentStates: () => readonly { state: string }[]
  hasStagedMigration: () => boolean
  automationsBusy: () => boolean
  emulatorsBusy: () => Promise<boolean>
  /** Stop the monitor before recording signal-driven shutdown. */
  registerCleanup: (cleanup: () => void) => void
}

/** Under the startup lock, consume previous idle-stop evidence before this run can overwrite it. */
export function beginMarkovdIdleExit(userDataPath: string): {
  previousIdleStop: MarkovdIdleStopRecord | null | undefined
  start: (ports: MarkovdIdleExitRuntimePorts) => Promise<void>
} {
  withdrawMarkovdWslHolderRelease(userDataPath)
  const config = resolveMarkovdManagedIdleExit(process.env)
  if (!config) {
    return { previousIdleStop: undefined, start: async () => {} }
  }
  const previousIdleStop = consumeMarkovdIdleStopRecord(userDataPath)
  if (previousIdleStop) {
    console.error(`[markovd] the previous run stopped idle at ${previousIdleStop.stoppedAt}`)
  }
  const version = getAppEnvironment().getVersion()
  return {
    previousIdleStop,
    start: (ports) => startMarkovdManagedIdleExit({ ...ports, config, userDataPath, version })
  }
}

async function startMarkovdManagedIdleExit(
  input: MarkovdIdleExitRuntimePorts & {
    config: MarkovdManagedIdleExitConfig
    userDataPath: string
    version: string
  }
): Promise<void> {
  const { getLocalPtyProvider } = await import('../ipc/pty/provider/registry')
  const { getCurrentDaemonPid, getDaemonEndpointFacts, isDaemonTerminalAdmissionClosed } =
    await import('../daemon/providers/lifecycle/daemon-provider-state')
  const { countLiveMarkovdDaemonSessions, retireMarkovdDaemonIfIdle } =
    await import('./markovd-daemon-retirement')
  const idleRecord = createIdleStopRecordOwnership(input.userDataPath)
  const hasChatProviders = (): boolean =>
    getStructuredAgentSessionHost()?.hasLoadedProviders() ?? false
  const ports: MarkovdManagedIdleExitPorts = {
    readClientActivity: () => input.rpc.readClientActivity(),
    listTerminals: () => getLocalPtyProvider().listProcesses(),
    countDaemonSessions: countLiveMarkovdDaemonSessions,
    hasDaemon: () => getDaemonEndpointFacts() !== null,
    agentStates: input.agentStates,
    hasChatProviders,
    hasStagedMigration: input.hasStagedMigration,
    automationsBusy: input.automationsBusy,
    emulatorsBusy: input.emulatorsBusy,
    activationFenceExists
  }
  // Client/terminal evidence is already checked; recheck other work exit would destroy.
  const nonTerminalWorkProbes = createMarkovdIdleProbes(input.config, ports).filter(
    (probe) => probe.name !== 'clients' && probe.name !== 'terminals'
  )
  const hasNonTerminalWork = async (): Promise<boolean> => {
    for (const probe of nonTerminalWorkProbes) {
      if (
        (await Promise.resolve()
          .then(probe.read)
          .catch(() => 'unverifiable')) !== 'idle'
      ) {
        return true
      }
    }
    return false
  }
  const dispose = installMarkovdManagedIdleExit({
    config: input.config,
    ports,
    stop: async (evidence) => {
      // Replacement must target only the daemon incarnation that agreed to retire.
      const retiringPid = getCurrentDaemonPid()
      const outcome = await stopForIdle(input, evidence, retireMarkovdDaemonIfIdle)
      // Clients/providers can return while the retirement reply is pending.
      const activity = input.rpc.readClientActivity()
      if (
        hasChatProviders() ||
        activity.openConnections > 0 ||
        activity.requestsInFlight > 0 ||
        activity.lastRequestAt > evidence.quietSince
      ) {
        discardMarkovdIdleStopRecord(input.userDataPath)
        const daemon = await recoverDaemonAfterCancelledIdleStop(outcome, {
          admissionClosed: isDaemonTerminalAdmissionClosed,
          retireAgain: () => retireMarkovdDaemonIfIdle(),
          replaceDaemon: async () => {
            if (retiringPid === null) {
              throw new Error('the retiring daemon never identified itself')
            }
            const { restartDaemon } =
              await import('../daemon/providers/lifecycle/daemon-provider-restart')
            await restartDaemon({ expectedDaemonPid: retiringPid, endpointMayBeGone: true })
          }
        })
        if (daemon === 'serving' || (await hasNonTerminalWork())) {
          return false
        }
        idleRecord.requestShutdown(requestIdleShutdown)
        return true
      }
      if (idleStopMayReleaseWslHolder(process.env, outcome)) {
        try {
          requestMarkovdWslHolderRelease(input.userDataPath)
        } catch (error) {
          console.error('[markovd] could not release the WSL distro holder:', error)
        }
      }
      idleRecord.requestShutdown(requestIdleShutdown)
      return true
    }
  })
  input.registerCleanup(() => {
    dispose()
    idleRecord.onShutdown()
  })
}

/** Discard failed, overdue and externally superseded idle stops, including cleanup before request completion. */
export function createIdleStopRecordOwnership(userDataPath: string): {
  requestShutdown(request: MarkovdShutdownTrigger | null): void
  onShutdown(): void
} {
  let idleOwnsStop = false
  // The holder release rides on the idle stop: a stop that is not idle must not end the distro.
  const discard = (): void => {
    discardMarkovdIdleStopRecord(userDataPath)
    withdrawMarkovdWslHolderRelease(userDataPath)
  }
  return {
    requestShutdown: (request) => {
      // Cleanup may run before the trigger returns, so establish ownership first.
      idleOwnsStop = true
      if (request?.('idle', discard) !== true) {
        idleOwnsStop = false
        discard()
      }
    },
    onShutdown: () => {
      if (!idleOwnsStop) {
        discard()
      }
    }
  }
}

async function stopForIdle(
  input: { userDataPath: string; version: string },
  evidence: MarkovdIdleExitEvidence,
  retireDaemon: () => Promise<MarkovdDaemonRetirement>
): Promise<MarkovdDaemonRetirement> {
  console.error(`[markovd] stopping: no client, terminal or job for ${evidence.timeoutMs}ms`)
  try {
    writeMarkovdIdleStopRecord(input.userDataPath, evidence, input.version)
  } catch (error) {
    console.error('[markovd] could not record the idle stop:', error)
  }
  // Only the daemon’s atomic empty census can authorize retirement.
  const outcome = await retireDaemon().catch((error: unknown): MarkovdDaemonRetirement => ({
    retirement: 'unverifiable',
    liveSessions: null,
    reason: String(error)
  }))
  console.error(
    `[markovd] terminal daemon on idle stop: ${outcome.retirement}${outcome.reason ? ` (${outcome.reason})` : ''}`
  )
  return outcome
}
