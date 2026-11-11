import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readRuntimeMetadata } from '../runtime/rpc/server/runtime-metadata'
import { RUNTIME_SOCKET_NAME_REGEX } from '../runtime/rpc/server/runtime-rpc-socket-metadata'

/** Null leaves endpoints unverifiable when runtime metadata is unreadable. */
export function markovdLockHolderEndpoints(dataRoot: string, pid: number): string[] | null {
  const endpoints = new Set<string>()
  try {
    const metadata = readRuntimeMetadata(dataRoot)
    if (metadata?.pid === pid) {
      for (const transport of metadata.transports ?? []) {
        endpoints.add(transport.endpoint)
      }
    }
    for (const entry of readdirSync(dataRoot)) {
      if (RUNTIME_SOCKET_NAME_REGEX.exec(entry)?.[1] === String(pid)) {
        endpoints.add(join(dataRoot, entry))
      }
    }
  } catch {
    return null
  }
  return [...endpoints]
}
