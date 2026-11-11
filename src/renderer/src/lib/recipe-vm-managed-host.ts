import { isRuntimeOwnedSshTargetId, parseExecutionHostId } from '../../../shared/execution-host'
import {
  getManagedMarkovdSshTargetId,
  type ManagedMarkovdEnvironmentSummary
} from '../../../shared/managed-markovd-execution-host'

/** The hidden SSH target of the recipe VM whose managed server is `hostId`, or null. */
export function getRecipeVmSshTargetForHost(
  environments: readonly ManagedMarkovdEnvironmentSummary[],
  hostId: string | null | undefined
): string | null {
  const host = parseExecutionHostId(hostId)
  if (host?.kind !== 'runtime') {
    return null
  }
  const environment = environments.find((entry) => entry.id === host.environmentId)
  const targetId = environment ? getManagedMarkovdSshTargetId(environment) : null
  return targetId && isRuntimeOwnedSshTargetId(targetId) ? targetId : null
}
