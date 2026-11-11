import { randomUUID } from 'node:crypto'
import {
  markovdNodePtyNativeArtifacts,
  markovdRipgrepArtifact
} from '../../../shared/markovd-artifacts'
import { markovdAgentBrowserNativeName } from '../../../shared/markovd-agent-browser-name'
import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import { ensureRemoteMarkovdNodeRuntime } from './markovd-remote-node-runtime'
import { recordedRemoteNodeRuntimeProbeCommand } from './markovd-remote-node-runtime-recorded-probe'
import { cachedMarkovdSlotInstalled } from './markovd-remote-install-cached-probe'
import {
  execCommand,
  isUnconfirmedSshCommandTermination
} from '../../ssh/remote-exec/remote-exec-command'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'
import { MARKOVD_INSTALL_MODEL } from './remote-install-model'
import { acquireInstallLock } from './remote-install-lock'
import { MARKOVD_FENCE_OWNER_FILENAME } from '../activation/markovd-activation-fence-scope'
import {
  forgetHeldMarkovdFence,
  rememberHeldMarkovdFence
} from '../../ssh/markovd-held-fence-tokens'
import { exitedOwnLockProof } from '../../ssh/markovd-exited-own-lock'
import { markovdWindowsBaseDir } from './markovd-remote-windows-node'
import { uploadRemoteInstallDirectory, writeRemoteInstallFile } from './remote-install-transfers'
import {
  abandonInstall,
  finalizeInstall,
  isRemoteInstallComplete
} from './remote-versioned-install'

export async function installMarkovdBundle(
  options: {
    conn: MarkovdHostTransport
    host: RemoteHostPlatform
    localMarkovdDir: string
    target: NodeRuntimeTarget
    /** Lazily acquire verified runtime bytes only if the host needs them. */
    nodeRuntimeArchive: () => Promise<string>
    /** Offline archive location named when downloads fail. */
    nodeRuntimeOfflineArchivePath?: string
    /** Per-source connect budget for the host's own download fallback. */
    nodeRuntimeHostConnectTimeoutSeconds?: number
    /** WSL opt-in: reuse a matching stat signature previously hashed to this pin. */
    recordedNodeRuntimeProbe?: boolean
    signal?: AbortSignal
  },
  fullVersion: string,
  remoteDir: string
): Promise<'uploaded' | 'reused'> {
  if (options.recordedNodeRuntimeProbe && (await cachedMarkovdSlotInstalled(options, remoteDir))) {
    return 'reused'
  }
  // Existing slot bytes are unusable without their referenced runtime.
  await ensureRemoteMarkovdNodeRuntime({
    conn: options.conn,
    host: options.host,
    slotDir: remoteDir,
    target: options.target,
    archivePath: options.nodeRuntimeArchive,
    offlineArchivePath: options.nodeRuntimeOfflineArchivePath,
    hostConnectTimeoutSeconds: options.nodeRuntimeHostConnectTimeoutSeconds,
    signal: options.signal,
    ...(options.recordedNodeRuntimeProbe
      ? { posixProbeCommand: recordedRemoteNodeRuntimeProbeCommand }
      : {})
  })
  if (
    await isRemoteInstallComplete(options.conn, MARKOVD_INSTALL_MODEL, remoteDir, options.host, {
      signal: options.signal
    })
  ) {
    return 'reused'
  }
  // Persist the token so a relaunch can prove ownership of an interrupted upload lock.
  const token = randomUUID()
  rememberHeldMarkovdFence(token)
  try {
    await acquireInstallLock(options.conn, remoteDir, options.host, {
      signal: options.signal,
      owner: { fileName: MARKOVD_FENCE_OWNER_FILENAME, token },
      // SFTP uploads and chmod leave no host workload after this client exits.
      exitedOwner: exitedOwnLockProof(options, {
        baseDir: markovdWindowsBaseDir(options.host, remoteDir),
        guardsStateMutation: false
      })
    })
  } catch (error) {
    if (!isUnconfirmedSshCommandTermination(error)) {
      forgetHeldMarkovdFence(token)
    }
    throw error
  }
  let preserveInstallLock = false
  try {
    // A sibling may have completed deployment while this client waited for the lock.
    if (
      await isRemoteInstallComplete(options.conn, MARKOVD_INSTALL_MODEL, remoteDir, options.host, {
        signal: options.signal
      })
    ) {
      return 'reused'
    }
    await uploadRemoteInstallDirectory(
      options.conn,
      options.localMarkovdDir,
      remoteDir,
      options.host,
      {
        signal: options.signal
      }
    )
    if (options.host.os !== 'win32') {
      await execCommand(
        options.conn,
        executablePermissionsCommand(options.host, remoteDir, options.target),
        {
          wrapCommand: options.host.commandDialect !== 'powershell',
          signal: options.signal
        }
      )
    }
    await writeRemoteInstallFile(
      options.conn,
      options.host,
      joinRemotePath(options.host, remoteDir, MARKOVD_INSTALL_MODEL.versionFilename),
      fullVersion,
      { signal: options.signal }
    )
    await finalizeInstall(options.conn, remoteDir, options.host, {
      signal: options.signal,
      releaseLock: false
    })
    return 'uploaded'
  } catch (error) {
    preserveInstallLock = isUnconfirmedSshCommandTermination(error)
    throw error
  } finally {
    if (!preserveInstallLock) {
      // Retain ownership proof if interrupted cleanup cannot confirm lock removal.
      if (await abandonInstall(options.conn, remoteDir, options.host)) {
        forgetHeldMarkovdFence(token)
      }
    }
  }
}

export function executablePermissionsCommand(
  host: RemoteHostPlatform,
  directory: string,
  target: NodeRuntimeTarget
): string {
  const required = [markovdRipgrepArtifact(target), ...markovdNodePtyNativeArtifacts(target)]
    .filter((artifact) => /\/(?:rg|spawn-helper)$/.test(artifact))
    .map((artifact) => joinRemotePath(host, directory, ...artifact.split('/')))
  const browsers = new Set(
    (['glibc', 'musl'] as const).map((libc) =>
      quotePosixShell(
        joinRemotePath(host, directory, markovdAgentBrowserNativeName(host.os, host.arch, libc))
      )
    )
  )
  // Restore executable modes lost by SFTP; absent optional browser binaries remain supported.
  return (
    `chmod 755 ${required.map(quotePosixShell).join(' ')} && ` +
    `for executable in ${[...browsers].join(' ')}; do ` +
    'if [ -f "$executable" ]; then chmod 755 "$executable" || exit $?; fi; done'
  )
}
