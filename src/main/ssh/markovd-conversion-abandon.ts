/** Registered destinations must abort/prove empty, then unregister before fence release so later starts cannot reclaim the host. Never-registered destinations held nothing. */
import { removeManagedMarkovdEnvironment } from '../../shared/remote-runtime/host-store/runtime-environment-managed-markovd-store'
import { listEnvironments } from '../../shared/remote-runtime/host-store/runtime-environment-store'
import type { KnownRuntimeEnvironment } from '../../shared/remote-runtime/host-catalog/runtime-environments'
import { closeMarkovdManagedTunnel } from '../managed-server/lifecycle/markovd-managed-tunnel'
import {
  abortMarkovdMigrationCutover,
  type MarkovdMigrationAbortResult,
  type MarkovdMigrationCutoverContext,
  type MarkovdMigrationDestinationCatalog
} from './markovd-migration-cutover-coordinator'
import { findMarkovdMigrationSourceCutoverForTarget } from './markovd-migration-cutover-journal'
import {
  releaseMarkovdMigrationFence,
  releaseUndeployedMigrationFence
} from './markovd-migration-source-fence'

export async function abandonMarkovdConversion(args: {
  userDataPath: string
  store: MarkovdMigrationCutoverContext['store']
  claims: MarkovdMigrationCutoverContext['claims']
  targetId: string
  destinationFor: (environment: KnownRuntimeEnvironment) => MarkovdMigrationDestinationCatalog
}): Promise<MarkovdMigrationAbortResult | 'none'> {
  const cutover = findMarkovdMigrationSourceCutoverForTarget(args.userDataPath, args.targetId)
  // Committed delta chains resolve only through the delta flow.
  if (!cutover || cutover.supersedesMigrationId) {
    return 'none'
  }
  const isRegistered = (id: string): boolean =>
    listEnvironments(args.userDataPath).some((entry) => entry.id === id)
  const environment = listEnvironments(args.userDataPath).find(
    (entry) => entry.id === cutover.destinationEnvironmentId
  )
  if (!environment) {
    await releaseUndeployedMigrationFence({ ...args, isDestinationRegistered: isRegistered })
    return 'none'
  }
  const context = { ...args, destination: args.destinationFor(environment) }
  return abortMarkovdMigrationCutover(context, cutover.migrationId, async (aborted) => {
    await closeMarkovdManagedTunnel(environment.id).catch(() => undefined)
    removeManagedMarkovdEnvironment(args.userDataPath, environment.id)
    await releaseMarkovdMigrationFence(context, aborted)
  })
}
