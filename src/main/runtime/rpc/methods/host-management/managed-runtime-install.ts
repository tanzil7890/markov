// Install on the agent's chat host without a workspace; negotiate install.v1/remove.v1 and stream a snapshot followed by state revisions.

import {
  ManagedRuntimeAgentParams,
  ManagedRuntimeCancelParams
} from '../../../../../shared/rpc-contract/managed-runtime-install-params'
import { managedRuntimeInstallationFor } from '../../../agent-session/installation/managed-runtime-installations'
import { defineMethod, defineStreamingMethod } from '../../core'
import { bindStructuredAgentSessionStream } from '../structured-sessions/subscriptions/structured-agent-session-status-stream'

export const MANAGED_RUNTIME_INSTALL_METHODS = [
  defineStreamingMethod({
    name: 'managedRuntime.subscribe',
    permission: 'workspace',
    params: ManagedRuntimeAgentParams,
    handler: async ({ agent }, ctx, emit) => {
      const installation = managedRuntimeInstallationFor(agent, ctx.runtime)
      // A failed first read fails the subscribe; a later one keeps the client's last snapshot.
      let shown = await installation.status()
      const frame = ctx.requestId ? `:${ctx.requestId}` : ''
      const subscriptionId = `managedRuntime:${ctx.connectionId ?? 'local'}:${agent}${frame}`
      let dispose = (): void => {}
      const stream = bindStructuredAgentSessionStream(ctx, subscriptionId, () => dispose())
      if (stream.isClosed()) {
        return
      }
      let reading = false
      let again = false
      // One read at a time; revisions during it coalesce into one more read.
      const follow = async (): Promise<void> => {
        again = true
        if (reading) {
          return
        }
        reading = true
        try {
          while (again && !stream.isClosed()) {
            again = false
            const next = await installation.status(false)
            if (next.revision !== shown.revision && !stream.isClosed()) {
              shown = next
              emit(next)
            }
          }
        } catch (error) {
          console.warn(`[managed-runtime] ${agent} status not read for a subscriber:`, error)
        } finally {
          reading = false
        }
      }
      dispose = installation.subscribe(() => void follow())
      emit(shown)
      // Catches a revision between the first read and the subscribe.
      void follow()
    }
  }),
  defineMethod({
    name: 'managedRuntime.install',
    permission: 'host-admin',
    params: ManagedRuntimeAgentParams,
    handler: async ({ agent }, { runtime }) => {
      const installation = managedRuntimeInstallationFor(agent, runtime)
      installation.install()
      return installation.status()
    }
  }),
  defineMethod({
    name: 'managedRuntime.cancel',
    permission: 'host-admin',
    params: ManagedRuntimeCancelParams,
    handler: async ({ agent, operationId }, { runtime }) => {
      // The outcome once the run has unwound: `cancelled`, or `succeeded` if it had committed.
      return await managedRuntimeInstallationFor(agent, runtime).cancel(operationId)
    }
  }),
  defineMethod({
    name: 'managedRuntime.remove',
    permission: 'host-admin',
    params: ManagedRuntimeAgentParams,
    handler: async ({ agent }, { runtime }) => {
      const installation = managedRuntimeInstallationFor(agent, runtime)
      installation.remove()
      return installation.status()
    }
  })
] as const
