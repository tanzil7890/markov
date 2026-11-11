import type { MarkovdHostTransport } from './markovd-host-transport'
import type { SshConnection } from './connection/ssh-connection'

/** Return the connection object itself: tunnel ownership, dedupe and caches depend on its identity. */
export function sshMarkovdHostTransport(connection: SshConnection): MarkovdHostTransport {
  return connection
}
