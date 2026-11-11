// SSH forwarding needs only loopback; network exposure must be an explicit operator choice.
import { isIP } from 'node:net'

export const MARKOVD_LOOPBACK_BIND_HOST = '127.0.0.1'
const ALL_INTERFACES_V4 = '0.0.0.0'
const ALL_INTERFACES_V6 = '::'

export class MarkovdBindAddressError extends Error {
  readonly code = 'markovd_invalid_bind_address'
}

/** Require literal IPs so DNS cannot silently choose a public/private bind interface. */
export function resolveMarkovdBindHost(raw?: string): string {
  if (raw === undefined) {
    return MARKOVD_LOOPBACK_BIND_HOST
  }
  const value = raw.trim()
  if (value === '') {
    throw new MarkovdBindAddressError('--bind expects an address')
  }
  if (value === 'localhost') {
    return MARKOVD_LOOPBACK_BIND_HOST
  }
  if (isIP(value) === 0) {
    throw new MarkovdBindAddressError(
      `--bind expects a literal IP address (got '${value}'). Hostnames are refused because ` +
        'DNS decides which interface would be bound. Use 127.0.0.1 for loopback, or ' +
        '0.0.0.0 to expose every interface.'
    )
  }
  return value
}

export function bindHostIsNetworkExposed(host: string): boolean {
  if (host === ALL_INTERFACES_V4 || host === ALL_INTERFACES_V6) {
    return true
  }
  if (isIP(host) === 4) {
    return !host.startsWith('127.')
  }
  return host !== '::1'
}

export function describeMarkovdBindExposure(host: string): string {
  return bindHostIsNetworkExposed(host)
    ? `markovd is bound to ${host} and is reachable from the network. Anything that can reach ` +
        'this port can attempt pairing.'
    : `markovd is bound to ${host} (local only). Reach it from another machine with an SSH ` +
        'local port-forward, or re-launch with --bind to expose it.'
}
