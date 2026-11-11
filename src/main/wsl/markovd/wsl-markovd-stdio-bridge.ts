/** D2: each accepted loopback socket owns a pinned-Node wsl.exe stdio bridge. Avoid WSL localhost forwarding, whose startup refusal window and network-mode dependence make it unreliable. */
import {
  observeWslMarkovdBridgeChannel,
  type WslMarkovdBridgeChannelEvents
} from './wsl-markovd-bridge-activity'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import {
  MARKOVD_STDIO_BRIDGE_DEPENDENCIES,
  startMarkovdStdioBridge,
  type MarkovdStdioBridgeDependencies
} from '../../managed-server/lifecycle/markovd-stdio-bridge-provider'
import type { StartedPortForward } from '../../ssh/port-forwarding/ssh-port-forward-provider'
import { assertWslUncPathRunning } from '../filesystem/wsl-unc-access-gate'

export type WslMarkovdStdioBridgeOptions = {
  environmentId: string
  /** The distro each bridge child runs in; a dial is refused while it is stopped (E9). */
  distro: string
  /** markovd's loopback port inside the distro. */
  remotePort: number
  /** 0 picks a free one. */
  localPort: number
  label: string
  /** Each bridged socket's lifetime, for the liveness watch that rides the desktop's sockets. */
  events?: WslMarkovdBridgeChannelEvents
}

export function listenWslMarkovdStdioBridge(
  transport: MarkovdHostTransport,
  options: WslMarkovdStdioBridgeOptions,
  dependencies: MarkovdStdioBridgeDependencies = MARKOVD_STDIO_BRIDGE_DEPENDENCIES
): Promise<StartedPortForward> {
  const { distro, events } = options
  return startMarkovdStdioBridge(
    transport,
    {
      id: `wsl-markovd:${options.environmentId}`,
      connectionId: options.environmentId,
      localHost: '127.0.0.1',
      localPort: options.localPort,
      remoteHost: '127.0.0.1',
      remotePort: options.remotePort,
      label: options.label
    },
    {
      ...dependencies,
      openChannel: async (conn, bridge) => {
        // A dial (a client's reconnect, a runtime call, the watch) is never a user act, and each
        // spawns wsl.exe, which boots a stopped distro. A user act boots it by connecting first.
        await assertWslUncPathRunning('', distro)
        const channel = await dependencies.openChannel(conn, bridge)
        return events ? observeWslMarkovdBridgeChannel(channel, events) : channel
      }
    }
  )
}

type WslMarkovdStdioBridgeListen = (
  transport: MarkovdHostTransport,
  options: WslMarkovdStdioBridgeOptions
) => Promise<StartedPortForward>

/** A persisted local port may be taken by now; a free one beats no connection. */
export async function listenWslMarkovdStdioBridgeOnPreferredPort(
  transport: MarkovdHostTransport,
  options: WslMarkovdStdioBridgeOptions,
  listen: WslMarkovdStdioBridgeListen = listenWslMarkovdStdioBridge
): Promise<StartedPortForward> {
  try {
    return await listen(transport, options)
  } catch (error) {
    if (options.localPort === 0) {
      throw error
    }
    console.warn(
      `[wsl] Could not rebind local port ${options.localPort}; picking another:`,
      error instanceof Error ? error.message : error
    )
    return listen(transport, { ...options, localPort: 0 })
  }
}
