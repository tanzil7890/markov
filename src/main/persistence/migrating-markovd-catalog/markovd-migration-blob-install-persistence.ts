import { MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS } from '../../../shared/markovd-migration/markovd-migration-blob-transfer'
import type { MarkovdMigrationManifest } from '../../../shared/markovd-migration/markovd-migration-manifest'
import type { PersistedState } from '../../../shared/persisted-state-types'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { getDaemonHistoryDir } from '../../daemon/launch/daemon-launch-paths'
import { getHistoryRoot } from '../../pty/history/terminal-history-paths'
import type { StoreRuntimeState } from '../loading-store/store-runtime-state'
import {
  findMarkovdMigrationImportReceipt,
  isMarkovdMigrationCommitDurable
} from './markovd-catalog-receipt-ledger'
import { installMarkovdMigrationReceivedBlobs } from './markovd-migration-blob-installers'
import { listMarkovdMigrationReceivedBlobNames } from './markovd-migration-blob-staging'
import type { MarkovdMigrationRequestIdentity } from './markovd-migration-staged-file'

type MarkovdMigrationBlobInstallRuntime = Pick<
  StoreRuntimeState,
  | 'state'
  | 'markovdMigrationBlobRoot'
  | 'markovdTerminalRestoreHints'
  | 'paneShellPath'
  | 'deferredShellHistoryWorktreeIds'
  | 'writeGeneration'
  | 'lastDurableWriteGeneration'
  | 'markovdMigrationCommitWriteGenerations'
>

type ClockOptions = { now?: () => Date }
type InstallOptions = ClockOptions & {
  /** Defer history installation while shells run in its worktree. */
  worktreeHasLiveShells?: (worktreeId: string) => boolean
}

const markovdMigrationBlobInstallContext = Symbol('MarkovdMigrationBlobInstallPersistence')
type MarkovdMigrationBlobInstallContext = {
  runtime: MarkovdMigrationBlobInstallRuntime
}

export class MarkovdMigrationBlobInstallPersistence {
  readonly [markovdMigrationBlobInstallContext]: MarkovdMigrationBlobInstallContext

  constructor(runtime: MarkovdMigrationBlobInstallRuntime) {
    this[markovdMigrationBlobInstallContext] = { runtime }
  }

  /** Wait for durable commit or a restart could lose both the catalog and its consumed blobs. */
  installMarkovdMigrationReceivedBlobs(
    manifest: MarkovdMigrationManifest,
    options: InstallOptions = {}
  ): void {
    const receipt = findMarkovdMigrationImportReceipt(
      this[markovdMigrationBlobInstallContext].runtime.state,
      manifest
    )
    if (receipt?.manifestSha256 !== manifest.manifestSha256) {
      return
    }
    installCommitted(this[markovdMigrationBlobInstallContext].runtime, manifest, options)
  }

  /** Recover interrupted installs; disk-loaded receipts already prove durability. */
  installPendingMarkovdMigrationReceivedBlobs(options: InstallOptions = {}): void {
    const { runtime } = this[markovdMigrationBlobInstallContext]
    for (const receipt of [
      ...(runtime.state.markovdMigrationImportReceipts ?? []),
      ...(runtime.state.markovdMigrationEvictedReceipts ?? [])
    ]) {
      try {
        installCommitted(runtime, receipt, options)
      } catch (error) {
        console.error(
          `[markovd-migration] installing received blobs for ${receipt.migrationId} failed:`,
          error
        )
      }
    }
  }

  /** Only the runtime installs pending shell history. */
  hasPendingMarkovdMigrationShellHistory(): boolean {
    const { runtime } = this[markovdMigrationBlobInstallContext]
    return [
      ...(runtime.state.markovdMigrationImportReceipts ?? []),
      ...(runtime.state.markovdMigrationEvictedReceipts ?? [])
    ].some((receipt) =>
      listMarkovdMigrationReceivedBlobNames(
        runtime.markovdMigrationBlobRoot,
        receipt,
        'shell-history'
      ).some((key) => MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].key.test(key))
    )
  }

  installDeferredMarkovdMigrationShellHistory(
    worktreeId: string,
    options: InstallOptions = {}
  ): void {
    const { runtime } = this[markovdMigrationBlobInstallContext]
    if (runtime.deferredShellHistoryWorktreeIds.has(worktreeId)) {
      this.installPendingMarkovdMigrationReceivedBlobs(options)
    }
  }

  /** Read without consuming. */
  peekMarkovdMigrationTerminalRestoreHint(
    paneKey: string,
    worktreeId: string,
    options: ClockOptions = {}
  ): string | null {
    return this[markovdMigrationBlobInstallContext].runtime.markovdTerminalRestoreHints.peek(
      paneKey,
      worktreeId,
      clock(options)
    )
  }

  /** Consume after spawn, even if it used a different cwd. */
  consumeMarkovdMigrationTerminalRestoreHint(paneKey: string, options: ClockOptions = {}): void {
    this[markovdMigrationBlobInstallContext].runtime.markovdTerminalRestoreHints.consume(
      paneKey,
      clock(options)
    )
  }
}

function installCommitted(
  runtime: MarkovdMigrationBlobInstallRuntime,
  migration: MarkovdMigrationRequestIdentity,
  options: InstallOptions
): void {
  if (!isMarkovdMigrationCommitDurable(runtime, migration)) {
    return
  }
  installMarkovdMigrationReceivedBlobs({
    migration,
    root: runtime.markovdMigrationBlobRoot,
    terminalRestoreHints: runtime.markovdTerminalRestoreHints,
    shellHistoryRoot: getHistoryRoot(),
    terminalHistoryRoot: getDaemonHistoryDir(),
    paneShellPath: () => runtime.paneShellPath(runtime.state.settings?.terminalDefaultShell),
    worktreeHasLiveShells: options.worktreeHasLiveShells,
    deferredShellHistoryWorktreeIds: runtime.deferredShellHistoryWorktreeIds,
    paneWorktreeId: (paneKey) => findPaneWorktreeId(runtime.state, paneKey),
    workspacePath: (worktreeId) => findWorkspacePath(runtime.state, worktreeId),
    now: clock(options)
  })
}

function clock(options: ClockOptions): number {
  return (options.now ?? (() => new Date()))().getTime()
}

// A git worktree id carries its path; a folder workspace's is on its record.
function findWorkspacePath(state: PersistedState, worktreeId: string): string | null {
  const separator = worktreeId.indexOf('::')
  if (separator > 0) {
    return worktreeId.slice(separator + 2) || null
  }
  return state.folderWorkspaces.find((folder) => folder.id === worktreeId)?.folderPath ?? null
}

// The commit merged the moved session in with its worktree ids unchanged.
function findPaneWorktreeId(state: PersistedState, paneKey: string): string | null {
  const tabId = parsePaneKey(paneKey)?.tabId
  if (!tabId) {
    return null
  }
  const sessions = [state.workspaceSession, ...Object.values(state.workspaceSessionsByHostId ?? {})]
  for (const session of sessions) {
    for (const [worktreeId, tabs] of Object.entries(session?.tabsByWorktree ?? {})) {
      if (tabs.some((tab) => tab.id === tabId)) {
        return worktreeId
      }
    }
  }
  return null
}
