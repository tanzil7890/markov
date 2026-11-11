/** Legacy SSH omits source.kind to preserve signed bytes/digests. Other kinds must set kind and omit sshTargetId:
 * older destinations strip unknown fields, then fail parsing instead of importing a non-SSH source as SSH. */
import type {
  MarkovdMigrationLocalWslManifestSource,
  MarkovdMigrationManifestSource,
  MarkovdMigrationSshManifestSource
} from './markovd-migration-manifest'
import { MARKOVD_MIGRATION_LOCAL_WSL_SOURCE_RUNTIME_CAPABILITY } from '../markovd-runtime-capabilities'

export const MARKOVD_MIGRATION_SSH_RELAY_SOURCE_KIND = 'ssh-relay' as const

/** Non-SSH kinds and the destination capability that proves a destination parses each one. */
export const MARKOVD_MIGRATION_SOURCE_KIND_CAPABILITIES = {
  'local-wsl': MARKOVD_MIGRATION_LOCAL_WSL_SOURCE_RUNTIME_CAPABILITY
} as const

export type MarkovdMigrationNonSshSourceKind =
  keyof typeof MARKOVD_MIGRATION_SOURCE_KIND_CAPABILITIES
export type MarkovdMigrationSourceKind =
  | typeof MARKOVD_MIGRATION_SSH_RELAY_SOURCE_KIND
  | MarkovdMigrationNonSshSourceKind

export const MARKOVD_MIGRATION_SOURCE_KIND_UNKNOWN = 'markovd_migration_source_kind_unknown'

/** A manifest source as it travels: this build may not know every field a newer peer signed. */
export type MarkovdMigrationWireSource = Readonly<Record<string, unknown>>

export function markovdMigrationManifestSourceKind(
  source: MarkovdMigrationWireSource
): MarkovdMigrationSourceKind {
  if (source.kind === undefined) {
    return MARKOVD_MIGRATION_SSH_RELAY_SOURCE_KIND
  }
  // An explicit 'ssh-relay' is refused too: SSH has exactly one encoding, so one digest.
  if (isNonSshSourceKind(source.kind)) {
    return source.kind
  }
  throw new Error(MARKOVD_MIGRATION_SOURCE_KIND_UNKNOWN)
}

function isNonSshSourceKind(kind: unknown): kind is MarkovdMigrationNonSshSourceKind {
  return typeof kind === 'string' && Object.hasOwn(MARKOVD_MIGRATION_SOURCE_KIND_CAPABILITIES, kind)
}

/** The capability a destination must advertise before it may see this source; null for SSH. */
export function requiredMarkovdMigrationSourceCapability(
  source: MarkovdMigrationWireSource
): string | null {
  const kind = markovdMigrationManifestSourceKind(source)
  return kind === MARKOVD_MIGRATION_SSH_RELAY_SOURCE_KIND
    ? null
    : MARKOVD_MIGRATION_SOURCE_KIND_CAPABILITIES[kind]
}

export function isMarkovdMigrationLocalWslSource(
  source: MarkovdMigrationManifestSource
): source is MarkovdMigrationLocalWslManifestSource {
  return 'kind' in source && source.kind === 'local-wsl'
}

/** For the SSH conversion's own steps: a WSL manifest reaching them is a bug, never a fallback. */
export function requireMarkovdMigrationSshSource(
  source: MarkovdMigrationManifestSource
): MarkovdMigrationSshManifestSource {
  if (isMarkovdMigrationLocalWslSource(source)) {
    throw new Error('markovd_migration_source_not_ssh')
  }
  return source
}
