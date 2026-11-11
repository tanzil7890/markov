import type { HostServerUpdateOnConnect } from './managed-server-update-check'
import {
  MANAGED_MARKOVD_FENCED_DETAIL,
  MANAGED_MARKOVD_NOT_ACTIVATED_DETAIL,
  type MarkovdManagedServing
} from '../managed-server/lifecycle/markovd-managed-serving'
import type { HostServerOnConnectResult } from './ssh-host-server-on-connect'

type ManagedRoute = Extract<HostServerOnConnectResult, { route: 'managed' }>

/** No active version continues to update/redeploy the still-linked server; return a managed result for other non-serving states. */
export function unservedManagedResult(
  environmentId: string,
  serving: MarkovdManagedServing
): ManagedRoute | null {
  if (serving.state !== 'unverifiable' || serving.detail === MANAGED_MARKOVD_NOT_ACTIVATED_DETAIL) {
    return null
  }
  // Still the managed route: a stopped server says nothing about the host's terminals.
  return {
    route: 'managed',
    environmentId,
    serving,
    ...(serving.detail === MANAGED_MARKOVD_FENCED_DETAIL ? { fenceHeld: true as const } : {})
  }
}

/** Preserve the not-activated note when update did not restore service. */
export function managedResultAfterUpdate(
  environmentId: string,
  serving: MarkovdManagedServing,
  { note, reason, fenceBusy }: HostServerUpdateOnConnect
): ManagedRoute {
  return {
    route: 'managed',
    environmentId,
    ...(note ? { update: note } : {}),
    ...(serving.state === 'unverifiable' && reason !== 'updated' ? { serving } : {}),
    ...(fenceBusy ? { fenceHeld: true as const } : {})
  }
}
