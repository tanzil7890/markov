import type { MarkovdManagedRuntimeStatus } from '../../../shared/markovd-managed-runtime'
import { runTargetLifecycle } from '../../ipc/ssh/ssh-target-lifecycle-queue'
import type { MarkovdActivationTransaction } from '../activation/markovd-activation-transaction'
import { readMarkovdActivationTransaction } from '../activation/markovd-activation-transaction-store'
import {
  requireManagedMarkovdEnvironment,
  resolveLinkedMarkovdContext
} from './markovd-managed-runtime-context'
import { currentManagedMarkovdUpdateDeferral } from './markovd-managed-update-deferrals'
import { findIncompleteManagedMarkovdMigration } from './markovd-managed-migration-status'
import { collectManagedTerminalCensus } from '../../ssh/markovd-terminal-census-client'
import { getAppEnvironment } from '../../../shared/app-environment'
import { bundledManagedMarkovdVersion } from './markovd-managed-auto-update'
import { availableManagedMarkovdUpdate } from './markovd-managed-update-decision'

/** Read host records without repairing them. */
export async function getManagedMarkovdRuntimeStatus(
  userDataPath: string,
  selector: string,
  signal?: AbortSignal
): Promise<MarkovdManagedRuntimeStatus> {
  const { environment, deployment } = requireManagedMarkovdEnvironment(userDataPath, selector)
  const { status, record, serverTarget } = await runTargetLifecycle(
    deployment.sshTargetId,
    async () => {
      const context = await resolveLinkedMarkovdContext(environment, deployment, signal)
      const record = context.activationRecord
      const transaction = await readMarkovdActivationTransaction({
        conn: context.connection,
        host: context.host,
        remoteHome: context.remoteHome,
        signal
      })
      const status: MarkovdManagedRuntimeStatus = {
        environmentId: environment.id,
        sshTargetId: context.target.id,
        activeVersion: record.active,
        activeAppVersion: record.active ? (record.activeAppVersion ?? null) : null,
        previousVersion: record.previous,
        activatedAt: record.activatedAt,
        rollbackAvailable: Boolean(record.previous && record.snapshot),
        recovery: transaction ? managedRecoveryStatus(transaction) : null,
        terminals: await collectManagedTerminalCensus(userDataPath, environment, record),
        migration: migrationStatus(userDataPath, environment.id),
        deferredUpdate: currentManagedMarkovdUpdateDeferral(environment.id, record)
      }
      return { status, record, serverTarget: context.serverTarget }
    }
  )
  // Outside the host queue: hashing the local template must not hold up host actions.
  // A local template fault hides only the offer, never the host's status.
  const candidateVersion = await bundledManagedMarkovdVersion(serverTarget).catch(() => null)
  return {
    ...status,
    availableUpdate: availableManagedMarkovdUpdate({
      record,
      candidateVersion,
      appVersion: getAppEnvironment().getVersion(),
      deferredCandidateVersion: status.deferredUpdate?.candidateVersion ?? null
    })
  }
}

function managedRecoveryStatus(
  transaction: MarkovdActivationTransaction
): NonNullable<MarkovdManagedRuntimeStatus['recovery']> {
  switch (transaction.operation) {
    case 'activate':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.candidateVersion,
        startedAt: transaction.startedAt
      }
    case 'rollback':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.targetVersion,
        startedAt: transaction.startedAt
      }
    case 'decommission':
      return {
        operation: transaction.operation,
        phase: transaction.phase,
        version: transaction.activeVersion,
        startedAt: transaction.startedAt
      }
  }
}

function migrationStatus(
  userDataPath: string,
  environmentId: string
): MarkovdManagedRuntimeStatus['migration'] {
  const migration = findIncompleteManagedMarkovdMigration(userDataPath, environmentId)
  return migration
    ? { migrationId: migration.migrationId, phase: migration.phase, startedAt: migration.startedAt }
    : null
}
