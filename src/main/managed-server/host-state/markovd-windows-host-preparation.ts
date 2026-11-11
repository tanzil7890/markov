// Stage pinned Node and a content-addressed host script so Windows operations share verified bytes without replacing running clients' code.
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-environment'
import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import { ensureRemoteMarkovdNodeRuntime } from '../install/markovd-remote-node-runtime'
import {
  installMarkovdWindowsHostScript,
  markovdRemoteBaseDir
} from '../install/markovd-remote-windows-node'
import { materializeNodeRuntimeArchive } from '../../node-runtime/pinned-runtime-materializer'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'

export async function prepareWindowsMarkovdHost(options: {
  conn: MarkovdHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  serverTarget: NodeRuntimeTarget
  signal?: AbortSignal
}): Promise<void> {
  const baseDir = markovdRemoteBaseDir(options.host, options.remoteHome)
  await ensureRemoteMarkovdNodeRuntime({
    conn: options.conn,
    host: options.host,
    // The runtime store is a sibling of slots; only this synthetic slot's parent is used.
    slotDir: joinRemotePath(options.host, baseDir, 'markovd-host'),
    target: options.serverTarget,
    archivePath: () =>
      materializeNodeRuntimeArchive(
        options.serverTarget,
        join(getAppEnvironment().getPath('userData'), 'markovd-artifacts'),
        { signal: options.signal }
      ),
    signal: options.signal
  })
  await installMarkovdWindowsHostScript(options, baseDir)
}
