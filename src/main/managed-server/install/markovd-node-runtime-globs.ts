import {
  MARKOVD_NODE_RUNTIME_DIR_PREFIX,
  MARKOVD_NODE_RUNTIME_POSIX_EXECUTABLE,
  MARKOVD_RUNTIMES_DIRNAME
} from '../../../shared/markovd-artifacts'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { RELAY_REMOTE_DIR } from '../../ssh/remote-exec/remote-frame-protocol'
import { MARKOVD_MACHINE_HOMES_DIRNAME } from '../host-state/markovd-machine-home'

/** POSIX shell glob words for markovd's pinned Node runtimes; machine homes may hold other architectures, so callers must self-test each match. */
export function markovdPosixNodeRuntimeGlobs(): [string, string] {
  const store = `${RELAY_REMOTE_DIR}/${MARKOVD_RUNTIMES_DIRNAME}/${MARKOVD_NODE_RUNTIME_DIR_PREFIX}`
  const executable = `/${MARKOVD_NODE_RUNTIME_POSIX_EXECUTABLE}`
  const machineStores = `${RELAY_REMOTE_DIR}/${MARKOVD_MACHINE_HOMES_DIRNAME}/`
  return [
    `"$HOME"/${quotePosixShell(store)}*${quotePosixShell(executable)}`,
    `"$HOME"/${quotePosixShell(machineStores)}*/${quotePosixShell(store)}*${quotePosixShell(executable)}`
  ]
}
