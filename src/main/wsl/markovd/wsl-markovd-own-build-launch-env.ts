import { hostMallocTunablesLaunchEnv } from '../../memory/host-malloc-tunables'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'

/** An older slot would leak GLIBC_TUNABLES to user shells, so only this build's own slot gets it. */
export function withOwnBuildLaunchEnv<T extends MarkovdHostTransport>(
  conn: T,
  ownBuildVersion: () => string | null
): T {
  const markovdLaunchEnv: MarkovdHostTransport['markovdLaunchEnv'] = async (launch) => [
    ...((await conn.markovdLaunchEnv?.(launch)) ?? []),
    ...(launch.fullVersion === ownBuildVersion() ? hostMallocTunablesLaunchEnv() : [])
  ]
  // Delegate rather than spread so prototype methods survive; #private fields would still need explicit forwarding.
  return Object.create(conn, { markovdLaunchEnv: { value: markovdLaunchEnv } })
}
