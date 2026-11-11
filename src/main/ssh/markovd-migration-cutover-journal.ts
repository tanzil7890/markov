/** Persist journals in owner-only profile sidecars: older profile schemas drop unknown fields but retain fences, so an in-profile journal could vanish on downgrade. Unreadable journals fail closed. */
import {
  MAX_MARKOVD_MIGRATION_SOURCE_CUTOVERS,
  isRetainedMarkovdMigrationSourceCutover,
  parseMarkovdMigrationSourceCutover,
  type MarkovdMigrationSourceCutover
} from '../../shared/markovd-migration/markovd-migration-source-cutover'
import {
  createMigrationJournalDirectory,
  orderMigrationJournalChain
} from '../persistence/migrating-markovd-catalog/migration-journal-directory'

class MarkovdMigrationCutoverJournalUnreadableError extends Error {
  constructor(detail: string) {
    super(`The migration journal cannot be read, so the SSH host stays fenced: ${detail}`)
    this.name = 'MarkovdMigrationCutoverJournalUnreadableError'
  }
}

type JournalChangeListener = (userDataPath: string) => void
let journalChangeListener: JournalChangeListener | null = null

export function setMarkovdMigrationJournalChangeListener(
  listener: JournalChangeListener | null
): void {
  journalChangeListener = listener
}

const journals = createMigrationJournalDirectory({
  directoryName: 'markovd-migration-cutovers',
  // A manifest carries catalog rows and dormant session state, never scrollback bytes.
  maxFileBytes: 16 * 1024 * 1024,
  parse: parseMarkovdMigrationSourceCutover,
  unreadable: (detail) => new MarkovdMigrationCutoverJournalUnreadableError(detail),
  onChange: (userDataPath) => journalChangeListener?.(userDataPath)
})

export function markovdMigrationCutoverJournalDirectory(userDataPath: string): string {
  return journals.directory(userDataPath)
}

/** Never skip an unreadable or untrusted journal. */
export function listMarkovdMigrationSourceCutovers(
  userDataPath: string
): MarkovdMigrationSourceCutover[] {
  return journals.list(userDataPath)
}

export function findMarkovdMigrationSourceCutoverForTarget(
  userDataPath: string,
  sshTargetId: string
): MarkovdMigrationSourceCutover | null {
  const chain = listMarkovdMigrationCutoverChainForTarget(userDataPath, sshTargetId)
  return chain.at(-1) ?? null
}

/** Oldest first; throws unless the target's journals form one chain of delta moves. */
export function listMarkovdMigrationCutoverChainForTarget(
  userDataPath: string,
  sshTargetId: string
): MarkovdMigrationSourceCutover[] {
  const matches = listMarkovdMigrationSourceCutovers(userDataPath).filter(
    (cutover) => cutover.sshTargetId === sshTargetId
  )
  return orderMigrationJournalChain(
    matches,
    (detail) => new MarkovdMigrationCutoverJournalUnreadableError(detail),
    `SSH target ${sshTargetId}`
  )
}

/** Flush before returning so later fence writes always have a durable journal. */
export function writeMarkovdMigrationSourceCutover(
  userDataPath: string,
  cutover: MarkovdMigrationSourceCutover
): void {
  const parsed = parseMarkovdMigrationSourceCutover(cutover)
  const existing = listMarkovdMigrationSourceCutovers(userDataPath)
  // Finished retained cutovers can wait two releases; only in-flight journals count toward the bound.
  const inFlight = existing.filter(
    (entry) => entry.phase !== 'source-retired' && !isRetainedMarkovdMigrationSourceCutover(entry)
  )
  if (
    !existing.some((entry) => entry.migrationId === parsed.migrationId) &&
    inFlight.length >= MAX_MARKOVD_MIGRATION_SOURCE_CUTOVERS
  ) {
    throw new Error('markovd_migration_cutover_capacity_exceeded')
  }
  journals.write(userDataPath, parsed)
}

export function removeMarkovdMigrationSourceCutover(
  userDataPath: string,
  migrationId: string
): void {
  journals.remove(userDataPath, migrationId)
}

export function removeMarkovdMigrationJournalsForDestination(
  userDataPath: string,
  sshTargetId: string,
  environmentId: string
): void {
  for (const cutover of listMarkovdMigrationSourceCutovers(userDataPath)) {
    if (cutover.sshTargetId === sshTargetId && cutover.destinationEnvironmentId === environmentId) {
      removeMarkovdMigrationSourceCutover(userDataPath, cutover.migrationId)
    }
  }
}
