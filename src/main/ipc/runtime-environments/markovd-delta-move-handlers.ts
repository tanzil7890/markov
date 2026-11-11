/** IPC for a host an older build changed after conversion: move its newer projects, or keep the server's. */
import { ipcMain } from 'electron'
import type {
  MarkovdDeltaMovePreview,
  MarkovdDeltaMoveResult
} from '../../../shared/markovd-managed-runtime'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { requireManagedMarkovdInfrastructure } from '../../managed-server/lifecycle/markovd-managed-runtime-context'
import { ensureMarkovdManagedTunnel } from '../../managed-server/lifecycle/markovd-managed-tunnel'
import {
  keepMarkovdServerVersion,
  runMarkovdDeltaMove
} from '../../ssh/markovd-migration-delta-move'
import { planMarkovdDeltaMove } from '../../ssh/markovd-migration-delta-plan'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/ssh-host-relay-census-for-target'
import {
  markovdMigrationDestinationFor,
  markovdServerAutomationEnablerFor
} from '../../managed-server/lifecycle/markovd-runtime-conversion-wiring'
import { enableMovedMarkovdAutomationsForTarget } from '../../ssh/markovd-migration-moved-automations'
import { requiredString } from './markovd-runtime-lifecycle-handlers'
import { publishResolvedChangedHostStatus } from './runtime-environment-managed-tunnel'
import { runTargetLifecycle } from '../ssh/ssh-target-lifecycle-queue'

export function registerMarkovdDeltaMoveHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(
    'runtimeEnvironments:previewMarkovdDeltaMove',
    (_event, args: { sshTargetId: string }): MarkovdDeltaMovePreview => {
      const { store, target } = requireChangedHost(args)
      const plan = planMarkovdDeltaMove(getUserDataPath(), store, target)
      const { sshTargetId, environmentId, added, notReflected, blockers } = plan
      return { sshTargetId, environmentId, added, notReflected, blockers }
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:moveMarkovdDelta',
    async (_event, args: { sshTargetId: string }): Promise<MarkovdDeltaMoveResult> => {
      const userDataPath = getUserDataPath()
      const { store, claims, target } = requireChangedHost(args)
      const environment = listEnvironments(userDataPath).find(
        (entry) => entry.id === target.markovdFence?.environmentId
      )
      if (!environment) {
        throw new Error('This host’s Markov server is no longer registered.')
      }
      const result = await runMarkovdDeltaMove({
        userDataPath,
        store,
        claims,
        target,
        environment,
        connectDestination: async () =>
          markovdMigrationDestinationFor(
            await ensureMarkovdManagedTunnel(userDataPath, environment.id)
          ),
        censusHost: censusHostRelayTerminalsFor(target),
        runTargetLifecycle
      })
      if (result.outcome === 'moved') {
        // Tunnel repair may have re-paired the server; read its current credentials.
        const paired = listEnvironments(userDataPath).find((entry) => entry.id === environment.id)
        const automationsLeftDisabled = await enableMovedMarkovdAutomationsForTarget(
          userDataPath,
          target.id,
          markovdServerAutomationEnablerFor(paired ?? environment)
        ).catch((error: unknown) => {
          console.warn('[ssh] Could not re-enable moved automations:', error)
          return 0
        })
        publishResolvedChangedHostStatus(target, environment.id, automationsLeftDisabled)
      }
      return result
    }
  )
  ipcMain.handle(
    'runtimeEnvironments:keepMarkovdServerVersion',
    async (_event, args: { sshTargetId: string }): Promise<void> => {
      const { store, claims, target, environmentId } = requireChangedHost(args)
      await runTargetLifecycle(target.id, () =>
        keepMarkovdServerVersion({ userDataPath: getUserDataPath(), store, claims, target })
      )
      publishResolvedChangedHostStatus(target, environmentId)
    }
  )
}

function requireChangedHost(args: { sshTargetId: string } | undefined) {
  const sshTargetId = requiredString(args?.sshTargetId, 'SSH target')
  const { targetStore, claims } = requireManagedMarkovdInfrastructure()
  const store = targetStore.getMarkovdMigrationSource()
  const target = store.getSshTarget(sshTargetId)
  if (!target?.markovdFence?.sourceChangedAt) {
    throw new Error('This SSH host has no changes from an older Markov to resolve.')
  }
  return { store, claims, target, environmentId: target.markovdFence.environmentId }
}
