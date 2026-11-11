// Preferred ports may belong to other runtimes; tunnel to the active slot's published bound port.
import {
  getRuntimeSshAccess,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../shared/ssh-types'
import type { ServeReadiness } from '../../server/serve-readiness'
import { managedMarkovdInstallDir } from './markovd-managed-runtime-context'
import { resolveMarkovdRemoteContext } from '../install/markovd-remote-context'
import {
  parseMarkovdReadinessWaitOutput,
  readMarkovdReadinessNowCommand
} from '../install/markovd-remote-readiness-wait'
import {
  execMarkovdRemote,
  type MarkovdRemoteExecTarget
} from '../install/markovd-remote-runtime-control'
import type { MarkovdHostTarget, MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import { parsePairingCode } from '../../../shared/remote-runtime/pairing/pairing'

export type MarkovdTunnelPortInput = {
  environment: KnownRuntimeEnvironment
  target: SshTarget
  connection: MarkovdHostTransport
}

export function markovdBoundPort(readiness: Pick<ServeReadiness, 'boundEndpoint'>): number | null {
  if (!readiness.boundEndpoint) {
    return null
  }
  try {
    const port = Number(new URL(readiness.boundEndpoint).port)
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null
  } catch {
    return null
  }
}

async function readManagedMarkovdSlotReadiness(
  target: MarkovdRemoteExecTarget & { remoteInstallDir: string }
): Promise<ServeReadiness | null> {
  const parsed = parseMarkovdReadinessWaitOutput(
    target.host,
    await execMarkovdRemote(
      target,
      readMarkovdReadinessNowCommand(target.host, target.remoteInstallDir)
    )
  )
  return parsed.state === 'ready' ? parsed.readiness : null
}

export async function readActiveManagedMarkovdReadiness(input: {
  target: MarkovdHostTarget
  connection: MarkovdHostTransport
}): Promise<ServeReadiness | null> {
  const context = await resolveMarkovdRemoteContext(input.target, input.connection)
  const active = context.activationRecord.active
  if (!active) {
    return null
  }
  return readManagedMarkovdSlotReadiness({
    conn: context.connection,
    host: context.host,
    remoteHome: context.remoteHome,
    remoteInstallDir: managedMarkovdInstallDir(context, active)
  })
}

async function readActiveSlotBoundPort(input: MarkovdTunnelPortInput): Promise<number | null> {
  if (!input.environment.markovdDeployment) {
    return null
  }
  const readiness = await readActiveManagedMarkovdReadiness(input)
  return readiness ? markovdBoundPort(readiness) : null
}

export async function resolveManagedMarkovdTunnelPort(
  input: MarkovdTunnelPortInput
): Promise<number> {
  const access = getRuntimeSshAccess(input.environment)
  if (!access) {
    throw new Error('Managed markovd environment is missing its SSH tunnel dependency.')
  }
  try {
    return (await readActiveSlotBoundPort(input)) ?? access.remotePort
  } catch (error) {
    // Post-forward identity validation still detects a wrong server when falling back.
    console.warn(
      '[ssh] Could not read the managed Markov server port; trying the preferred one:',
      error
    )
    return access.remotePort
  }
}

/** Missing or unreadable published ports never justify moving an existing tunnel. */
export async function readManagedMarkovdPublishedPort(
  input: MarkovdTunnelPortInput
): Promise<number | null> {
  try {
    return await readActiveSlotBoundPort(input)
  } catch {
    return null
  }
}

/** The server key the active slot offers to new pairings; null when unpublished or unreadable. */
export async function readManagedMarkovdPublishedKey(
  input: MarkovdTunnelPortInput
): Promise<string | null> {
  if (!input.environment.markovdDeployment) {
    return null
  }
  try {
    const readiness = await readActiveManagedMarkovdReadiness(input)
    return readiness?.pairing.available
      ? (parsePairingCode(readiness.pairing.url)?.publicKeyB64 ?? null)
      : null
  } catch {
    return null
  }
}
