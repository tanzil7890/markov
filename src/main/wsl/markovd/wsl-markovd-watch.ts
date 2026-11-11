/** Hold an unwritten bridge as liveness watch/port probe: markovd closes it on socket loss or distro stop. Measured exits arrive ~69ms/~40ms respectively; exit codes still require independent liveness evidence. */
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import {
  openMarkovdStdioBridgeChannel,
  resolveMarkovdStdioBridge
} from '../../ssh/markovd-stdio-bridge'
import {
  MarkovdStdioBridgeDecoder,
  type MarkovdStdioBridgeSignal
} from '../../managed-server/lifecycle/markovd-stdio-bridge-stream'
import type { RemoteCommandChannel } from '../../managed-server/install/remote-install-transport'

export type WslMarkovdWatch = {
  /** `ready` holds a live channel; anything else holds nothing. */
  signal: 'ready' | 'refused' | 'unverifiable'
  /** Called once, with the bridge's exit code, when a `ready` watch ends on its own. */
  onExit(listener: (code: number | null) => void): void
  close(): void
  /** Whether it currently proves markovd answers on its port (false while it holds no open path). */
  proving(): boolean
  /** Called each time it stops proving without an exit, so the next check can come sooner. */
  onIdle?(listener: () => void): void
}

const WATCH_OPEN_TIMEOUT_MS = 10_000

function inertWatch(signal: 'refused' | 'unverifiable'): WslMarkovdWatch {
  return { signal, onExit: () => {}, close: () => {}, proving: () => false }
}

export async function openWslMarkovdWatch(
  transport: MarkovdHostTransport,
  port: number,
  timeoutMs = WATCH_OPEN_TIMEOUT_MS
): Promise<WslMarkovdWatch> {
  let channel: RemoteCommandChannel
  try {
    channel = await openMarkovdStdioBridgeChannel(
      transport,
      await resolveMarkovdStdioBridge(transport, port)
    )
  } catch {
    return inertWatch('unverifiable')
  }
  return watchChannel(channel, timeoutMs)
}

/** Exported for tests: any channel speaking the bridge's sentinel protocol. */
export function watchChannel(
  channel: RemoteCommandChannel,
  timeoutMs: number
): Promise<WslMarkovdWatch> {
  const decoder = new MarkovdStdioBridgeDecoder('raw')
  let exitCode: number | null = null
  let ended = false
  let closedByUs = false
  let exitListener: ((code: number | null) => void) | null = null
  const close = (): void => {
    closedByUs = true
    try {
      channel.close()
    } catch {
      // Already gone.
    }
    decoder.destroy()
  }
  channel.on('exit', (code: unknown) => {
    exitCode = typeof code === 'number' ? code : null
  })
  channel.on('error', () => {})
  decoder.on('error', () => {})
  decoder.resume()
  channel.pipe(decoder)
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => settle('unverifiable'), timeoutMs)
    function settle(signal: MarkovdStdioBridgeSignal | 'unverifiable'): void {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (signal !== 'ready') {
        close()
        resolve(inertWatch(signal === 'refused' ? 'refused' : 'unverifiable'))
        return
      }
      resolve({
        signal: 'ready',
        onExit: (listener) => {
          exitListener = listener
          if (ended && !closedByUs) {
            listener(exitCode)
          }
        },
        close,
        proving: () => !ended && !closedByUs
      })
    }
    decoder.on('signal', (signal: MarkovdStdioBridgeSignal) => settle(signal))
    channel.on('close', (code: unknown) => {
      ended = true
      exitCode ??= typeof code === 'number' ? code : null
      settle('unverifiable')
      if (!closedByUs) {
        exitListener?.(exitCode)
        exitListener = null
      }
    })
  })
}
