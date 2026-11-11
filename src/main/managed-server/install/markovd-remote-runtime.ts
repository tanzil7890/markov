import {
  MARKOVD_BUILD_TARGET_FILENAME,
  MARKOVD_LAUNCHER_FILENAME,
  MARKOVD_SERVER_ENTRY_FILENAME,
  MARKOVD_NODE_RUNTIME_DIR_PREFIX,
  MARKOVD_NODE_RUNTIME_MARKER_FILENAME,
  MARKOVD_NODE_RUNTIME_POSIX_EXECUTABLE,
  MARKOVD_RUNTIMES_DIRNAME,
  markovdBunRuntimeFilename
} from '../../../shared/markovd-artifacts'
import { assertPosixMarkovdHost } from './markovd-remote-host-support'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { joinRemotePath, type RemoteHostPlatform } from '../../ssh/ssh-remote-platform'

// Assign the long slot path once to reduce command size on the wire.
function assignMarkovdSlot(directory: string): string {
  return `markovd_slot=${quotePosixShell(directory.replace(/\/+$/, ''))}; `
}

// Rollback must still accept legacy single-entry slots.
export function selectMarkovdSlotEntryCommand(host: RemoteHostPlatform, directory: string): string {
  assertPosixMarkovdHost(host)
  const server = `"$markovd_slot"/${quotePosixShell(MARKOVD_SERVER_ENTRY_FILENAME)}`
  const launcher = `"$markovd_slot"/${quotePosixShell(MARKOVD_LAUNCHER_FILENAME)}`
  return `${assignMarkovdSlot(directory)}if [ -f ${server} ]; then markovd_entry=${server}; else markovd_entry=${launcher}; fi`
}

/** Set $markovd_runtime or exit 78; callers decide what an absent marker means. */
export function markovdNodeSlotRuntimeCommand(host: RemoteHostPlatform, directory: string): string {
  assertPosixMarkovdHost(host)
  const nodeMarker = `"$markovd_slot"/${quotePosixShell(MARKOVD_NODE_RUNTIME_MARKER_FILENAME)}`
  const nodeRuntimePrefix = `"\${markovd_slot%/*}"/${quotePosixShell(
    `${MARKOVD_RUNTIMES_DIRNAME}/${MARKOVD_NODE_RUNTIME_DIR_PREFIX}`
  )}`
  const nodeExecutable = quotePosixShell(`/${MARKOVD_NODE_RUNTIME_POSIX_EXECUTABLE}`)
  return (
    `${assignMarkovdSlot(directory)}markovd_node_sha=$(cat ${nodeMarker}) || exit 78; ` +
    // The digest becomes a path segment; reject non-SHA256 values.
    // Leading ( keeps the case pattern parseable inside command substitution.
    'case "$markovd_node_sha" in ("" | *[!0-9a-f]*) exit 78;; esac; ' +
    '[ "${#markovd_node_sha}" -eq 64 ] || exit 78; ' +
    `markovd_runtime=${nodeRuntimePrefix}"$markovd_node_sha"${nodeExecutable}; ` +
    '[ -x "$markovd_runtime" ] || exit 78; '
  )
}

/** Keeps address space small under RLIMIT_AS: undici's WASM memory otherwise reserves 4-9 GiB (#37538).
 * Caps any WASM memory in markovd at 64 MiB. Pinned Node only: older host Node rejects the flag. */
const MARKOVD_PINNED_NODE_FLAGS = '--disable-wasm-trap-handler --wasm-max-mem-pages=1024'

/** Also sets $markovd_runtime_flags. Legacy host Node fallback must never hide an incomplete Node or Bun slot. */
export function selectMarkovdSlotRuntimeCommand(
  host: RemoteHostPlatform,
  directory: string,
  legacyNodePath: string
): string {
  assertPosixMarkovdHost(host)
  const nodeMarker = quotePosixShell(
    joinRemotePath(host, directory, MARKOVD_NODE_RUNTIME_MARKER_FILENAME)
  )
  const runtime = quotePosixShell(
    joinRemotePath(host, directory, markovdBunRuntimeFilename(host.os))
  )
  const target = quotePosixShell(joinRemotePath(host, directory, MARKOVD_BUILD_TARGET_FILENAME))
  return (
    // One compound command: launch chains it with && after cd.
    `if [ -e ${nodeMarker} ]; then ${markovdNodeSlotRuntimeCommand(host, directory)}` +
    `markovd_runtime_flags=${quotePosixShell(MARKOVD_PINNED_NODE_FLAGS)}; ` +
    `elif [ -e ${target} ] || [ -e ${runtime} ]; then ` +
    `[ -x ${runtime} ] || exit 78; markovd_runtime=${runtime}; markovd_runtime_flags=; ` +
    `else markovd_runtime=${quotePosixShell(legacyNodePath)}; markovd_runtime_flags=; fi`
  )
}
