import { NODE_RUNTIME_PIN } from './node-runtime-pin'
import type { MarkovdPreflightRuntimeIdentity } from './markovd-profile-preflight'

/** What a Node slot's candidate must report: the pinned runtime, never a host Node. */
export const MARKOVD_NODE_RUNTIME_IDENTITY: MarkovdPreflightRuntimeIdentity = {
  runtime: 'node',
  runtimeVersion: NODE_RUNTIME_PIN.version
}
