// In-place WSL moves require the desktop-launched markovd in the source distro to own the unchanged paths.
import type { MarkovdMigrationManifestSource } from '../../shared/markovd-migration/markovd-migration-manifest'
import { isMarkovdMigrationLocalWslSource } from '../../shared/markovd-migration/markovd-migration-source-kind'
import { isWslHostMarkovdProcess } from '../ipc/wsl-guest-windows-drive-path'
import { MARKOVD_WSL_DISTRO_GUID_ENV } from '../../shared/markovd-server-launch-env'

export const MARKOVD_MIGRATION_SOURCE_NOT_THIS_HOST = 'markovd_migration_source_not_this_host'

export { MARKOVD_WSL_DISTRO_GUID_ENV }

export function servesLocalWslMigrationSource(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): boolean {
  return isWslHostMarkovdProcess(env, platform)
}

// E2E hosts stand in for a WSL host's markovd; a real one is identified by isWslHostMarkovdProcess.
export const MARKOV_E2E_WSL_MOVE_DESTINATION_ENV = 'MARKOV_E2E_WSL_MOVE_DESTINATION'

/**
 * Whether this host is a WSL move's destination: it installs moved panes' terminal history and
 * serves their stored scrollback. Every other host keeps that wire surface off.
 */
export function servesWslMovedPaneHistory(env: NodeJS.ProcessEnv = process.env): boolean {
  return isWslHostMarkovdProcess(env) || env[MARKOV_E2E_WSL_MOVE_DESTINATION_ENV] === '1'
}

export function assertMarkovdMigrationSourceServedHere(
  source: MarkovdMigrationManifestSource,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): void {
  if (!isMarkovdMigrationLocalWslSource(source)) {
    return
  }
  // WSL distro names and their UNC forms are case-insensitive.
  const distro = env.WSL_DISTRO_NAME?.trim().toLowerCase()
  if (!servesLocalWslMigrationSource(env, platform) || distro !== source.distro.toLowerCase()) {
    throw new Error(MARKOVD_MIGRATION_SOURCE_NOT_THIS_HOST)
  }
  // Re-registering a distro reuses its name, not its files; require its registry ID when supplied.
  const guid = env[MARKOVD_WSL_DISTRO_GUID_ENV]?.trim().toLowerCase()
  if (source.distroGuid !== undefined && guid !== source.distroGuid.toLowerCase()) {
    throw new Error(MARKOVD_MIGRATION_SOURCE_NOT_THIS_HOST)
  }
}
