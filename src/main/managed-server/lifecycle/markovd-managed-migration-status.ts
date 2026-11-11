import {
  isRetainedMarkovdMigrationSourceCutover,
  type MarkovdMigrationSourceCutover
} from '../../../shared/markovd-migration/markovd-migration-source-cutover'
import {
  getMarkovdSshDeployment,
  type KnownRuntimeEnvironment
} from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { listMarkovdMigrationSourceCutovers } from '../../ssh/markovd-migration-cutover-journal'

type MarkovdManagedPendingMigration = {
  migrationId: string
  environmentId: string
  name: string
  sshTargetId: string
  phase: MarkovdMigrationSourceCutover['phase']
  startedAt: string
}

/** Unreadable journals must not look like absent migrations. */
export function listPendingManagedMarkovdMigrations(
  userDataPath: string
): MarkovdManagedPendingMigration[] {
  return (
    listMarkovdMigrationSourceCutovers(userDataPath)
      // Committed/retained journals preserve downgrade recovery, not pending migration work.
      .filter(
        (cutover) =>
          cutover.phase !== 'source-retired' && !isRetainedMarkovdMigrationSourceCutover(cutover)
      )
      .map((cutover) => ({
        migrationId: cutover.migrationId,
        environmentId: cutover.destinationEnvironmentId,
        name: cutover.destinationName,
        sshTargetId: cutover.sshTargetId,
        phase: cutover.phase,
        startedAt: cutover.startedAt
      }))
  )
}

export function findIncompleteManagedMarkovdMigration(
  userDataPath: string,
  environmentId: string
): MarkovdManagedPendingMigration | null {
  return (
    listPendingManagedMarkovdMigrations(userDataPath).find(
      (migration) => migration.environmentId === environmentId
    ) ?? null
  )
}

export function environmentMatchesManagedMarkovdCutover(
  environment: KnownRuntimeEnvironment,
  cutover: MarkovdMigrationSourceCutover
): boolean {
  const deployment = getMarkovdSshDeployment(environment)
  return (
    environment.id === cutover.destinationEnvironmentId &&
    environment.name === cutover.destinationName &&
    deployment?.sshTargetId === cutover.sshTargetId &&
    deployment.sshTargetGeneration === cutover.sshTargetGeneration
  )
}
