import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { MARKOVD_UPDATE_TERMINALS_RUNNING_CODE } from '../../../shared/markovd-managed-runtime'
import {
  getMarkovdSshDeployment,
  type KnownRuntimeEnvironment,
  type MarkovdSshDeploymentLink
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { getManagedMarkovdFenceEnvironmentId } from '../../../shared/managed-markovd-ssh-owner'
import type { ServeReadiness } from '../../server/serve-readiness'
import { computeLocalMarkovdBuildHash } from '../../ssh/markovd-local-build-hash'
import { sshMarkovdHostTransport } from '../../ssh/markovd-ssh-host-transport'
import type { MarkovdHostTarget } from '../../ssh/markovd-host-transport'
import type { MarkovdActivationRecord } from '../activation/markovd-activation-record'
import {
  admitMarkovdRecordForIntent,
  type MarkovdUpdateIntent
} from './markovd-managed-update-decision'
import {
  type MarkovdTerminalCensus,
  UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
} from '../../../shared/markovd-terminal-census'
import { probeActiveMarkovdReadiness } from '../../ssh/markovd-active-readiness'
import {
  resolveMarkovdRemoteContext,
  type MarkovdRemoteContext
} from '../install/markovd-remote-context'
import { MARKOVD_INSTALL_MODEL } from '../install/remote-install-model'
import { computeRemoteInstallDir } from '../install/remote-versioned-install'
import {
  getSshConnectionManager,
  getSshTargetRegistryStore
} from '../../ssh/targets/ssh-target-registry'

const MARKOVD_BIND_HOST = '127.0.0.1'

// Pinned slots must fail on absent markers rather than silently use host Node.
const MANAGED_MARKOVD_LEGACY_NODE_PATH = ''

export function requireManagedMarkovdInfrastructure() {
  const targetStore = requireManagedMarkovdTargetStore()
  const connectionManager = getSshConnectionManager()
  if (!connectionManager) {
    throw new Error('SSH is unavailable on this client; this host’s Markov server is unverifiable.')
  }
  return { connectionManager, targetStore, claims: targetStore.getMarkovdRuntimeClaims() }
}

export function requireManagedMarkovdTargetStore() {
  const targetStore = getSshTargetRegistryStore()
  if (!targetStore) {
    throw new Error('SSH target state is unavailable; this host’s Markov server is unverifiable.')
  }
  return targetStore
}

export function requireManagedMarkovdEnvironment(
  userDataPath: string,
  selector: string
): { environment: KnownRuntimeEnvironment; deployment: MarkovdSshDeploymentLink } {
  const environment = resolveEnvironment(userDataPath, selector)
  const deployment = getMarkovdSshDeployment(environment)
  if (!deployment || environment.connectionDependency !== 'ssh-tunnel') {
    throw new Error('This server is not managed through a markovd SSH deployment.')
  }
  return { environment, deployment }
}

export async function resolveLinkedMarkovdContext(
  environment: KnownRuntimeEnvironment,
  deployment: MarkovdSshDeploymentLink,
  signal?: AbortSignal
): Promise<MarkovdRemoteContext> {
  const { connectionManager, targetStore } = requireManagedMarkovdInfrastructure()
  const target = targetStore.getTarget(deployment.sshTargetId)
  if (
    !target ||
    target.generation !== deployment.sshTargetGeneration ||
    getManagedMarkovdFenceEnvironmentId(target) !== environment.id
  ) {
    throw new Error('The SSH registration for this host’s Markov server is no longer valid.')
  }
  const connection = await connectionManager.connect(target)
  return resolveMarkovdRemoteContext(target, sshMarkovdHostTransport(connection), signal)
}

export function managedMarkovdSlot(
  context: MarkovdRemoteContext<MarkovdHostTarget>,
  port: number,
  signal?: AbortSignal
) {
  return {
    conn: context.connection,
    host: context.host,
    remoteHome: context.remoteHome,
    nodePath: MANAGED_MARKOVD_LEGACY_NODE_PATH,
    userDataDir: context.userDataDir,
    bindHost: MARKOVD_BIND_HOST,
    port,
    signal
  }
}

export function managedMarkovdInstallDir(
  context: MarkovdRemoteContext<MarkovdHostTarget>,
  version: string
): string {
  return computeRemoteInstallDir(
    MARKOVD_INSTALL_MODEL,
    context.remoteHome,
    version,
    context.host.pathFlavor
  )
}

/** Accept readiness only from the build this client holds. */
export function probeManagedMarkovdReadiness(
  context: MarkovdRemoteContext<MarkovdHostTarget>,
  localMarkovdDir: string,
  fullVersion: string,
  signal?: AbortSignal
): Promise<ServeReadiness> {
  return probeActiveMarkovdReadiness(
    {
      conn: context.connection,
      host: context.host,
      remoteInstallDir: managedMarkovdInstallDir(context, fullVersion),
      signal
    },
    { buildHash: computeLocalMarkovdBuildHash(localMarkovdDir), fullVersion }
  )
}

export function managedMarkovdDeployPolicy(
  context: Pick<MarkovdRemoteContext<MarkovdHostTarget>, 'activationRecord'>,
  appVersion: string,
  intent: MarkovdUpdateIntent
): {
  census: MarkovdTerminalCensus
  recountCensus: () => Promise<MarkovdTerminalCensus>
  releaseIncumbentAdmission: () => Promise<void>
  censusRecord: MarkovdActivationRecord
  admitRecord: (record: MarkovdActivationRecord, candidateVersion: string) => string | null
} {
  // Only the active daemon can count sessions; guessing zero risks restarting live terminals.
  const census: MarkovdTerminalCensus = context.activationRecord.active
    ? UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
    : { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
  return {
    census,
    recountCensus: async () => census,
    releaseIncumbentAdmission: async () => {},
    censusRecord: context.activationRecord,
    // Only the fenced read can reject newer migrated state or rolled-back builds on this unlinked path.
    admitRecord: admitMarkovdRecordForIntent(intent, appVersion)
  }
}

// Force can override live terminal counts, never unknown census or protocol deferrals.
export function isForceableMarkovdDeferral(code: string): boolean {
  return code === MARKOVD_UPDATE_TERMINALS_RUNNING_CODE
}
