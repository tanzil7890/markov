// Lost channels drop their sockets but keep the listener; tunnel reconnect logic owns recovery.
import { MarkovdStdioBridgeUnavailableError } from '../../markovd/markovd-host-unavailable'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import {
  checkMarkovdStdioBridge,
  openMarkovdStdioBridgeChannel,
  resolveMarkovdStdioBridge,
  type MarkovdStdioBridge
} from '../../ssh/markovd-stdio-bridge'
import { listenMarkovdStdioBridge } from './markovd-stdio-bridge-listener'
import { sshMarkovdHostTransport } from '../../ssh/markovd-ssh-host-transport'
import type { RemoteCommandChannel } from '../install/remote-install-transport'
import type { SshConnection } from '../../ssh/connection/ssh-connection'
import type {
  PortForwardStartOptions,
  SshPortForwardProvider,
  StartedPortForward
} from '../../ssh/port-forwarding/ssh-port-forward-provider'

export type MarkovdStdioBridgeDependencies = {
  resolveBridge: (conn: MarkovdHostTransport, port: number) => Promise<MarkovdStdioBridge>
  checkBridge: (conn: MarkovdHostTransport, bridge: MarkovdStdioBridge) => Promise<unknown>
  openChannel: (
    conn: MarkovdHostTransport,
    bridge: MarkovdStdioBridge
  ) => Promise<RemoteCommandChannel>
}

export const MARKOVD_STDIO_BRIDGE_DEPENDENCIES: MarkovdStdioBridgeDependencies = {
  resolveBridge: resolveMarkovdStdioBridge,
  checkBridge: checkMarkovdStdioBridge,
  openChannel: openMarkovdStdioBridgeChannel
}

export class MarkovdStdioBridgePortForwardProvider implements SshPortForwardProvider {
  constructor(
    private readonly dependencies: MarkovdStdioBridgeDependencies = MARKOVD_STDIO_BRIDGE_DEPENDENCIES
  ) {}

  canHandle(conn: SshConnection): boolean {
    return conn.getClient() !== null || conn.usesSystemSshTransport()
  }

  start(conn: SshConnection, options: PortForwardStartOptions): Promise<StartedPortForward> {
    return startMarkovdStdioBridge(sshMarkovdHostTransport(conn), options, this.dependencies)
  }
}

export async function startMarkovdStdioBridge(
  host: MarkovdHostTransport,
  options: PortForwardStartOptions,
  deps: MarkovdStdioBridgeDependencies
): Promise<StartedPortForward> {
  let bridge: Promise<MarkovdStdioBridge> | null = null
  // Retry failed bridge resolution on the next socket.
  const resolveBridge = (): Promise<MarkovdStdioBridge> => {
    bridge ??= deps.resolveBridge(host, options.remotePort).catch((error: unknown) => {
      bridge = null
      throw error
    })
    return bridge
  }
  try {
    await deps.checkBridge(host, await resolveBridge())
  } catch (error) {
    if (error instanceof MarkovdStdioBridgeUnavailableError) {
      throw error
    }
    // Lost contact does not prove bridge absence; let new sockets resolve it again.
    console.warn('[ssh] Markov stdio bridge check was unverifiable:', error)
  }
  return listenMarkovdStdioBridge(options, async () => {
    const resolved = await resolveBridge()
    return { channel: await deps.openChannel(host, resolved), mode: resolved.mode }
  })
}
