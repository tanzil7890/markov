import { advertisedMarkovdMigrationBlobCapabilities } from '../../shared/markovd-migration/markovd-migration-blob-transfer'
import { SESSION_TERMINAL_SCROLLBACK_READ_RUNTIME_CAPABILITY } from '../../shared/session-tabs-runtime-capabilities'
import { servesWslMovedPaneHistory } from './markovd-migration-wsl-destination'

/**
 * Migration blob kinds this host installs, plus the stored-scrollback read a WSL move's destination
 * serves. Terminal history and the scrollback read stay off everywhere but a WSL host.
 */
export function advertisedMarkovdMigrationDestinationCapabilities(): string[] {
  const wslHost = servesWslMovedPaneHistory()
  return [
    ...advertisedMarkovdMigrationBlobCapabilities({ wslHost }),
    ...(wslHost ? [SESSION_TERMINAL_SCROLLBACK_READ_RUNTIME_CAPABILITY] : [])
  ]
}
