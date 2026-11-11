import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import { resolveMarkovdDeploymentTargetFacts } from '../../ssh/markovd-deployment-target'
import { MarkovdHostUnsupportedError } from '../../markovd/markovd-host-unavailable'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import { pinnedRuntimeTargetForHost } from '../../ssh/pinned-runtime-host-target'
import type { RemoteHostPlatform } from '../../ssh/ssh-remote-platform'

/** Lets a caller that knows the host kind add its own fix; the message is the one SSH shows. */
export class MarkovdHostGlibcUnsupportedError extends MarkovdHostUnsupportedError {
  constructor(target: string, glibc: string) {
    super(`No Markov runtime supports ${target} with glibc ${glibc}.`)
  }
}

export async function resolveMarkovdRuntimeTarget(options: {
  conn: MarkovdHostTransport
  host: RemoteHostPlatform
  signal?: AbortSignal
  exec?: (command: string) => Promise<string>
}): Promise<NodeRuntimeTarget> {
  const facts = await resolveMarkovdDeploymentTargetFacts(options)
  const target = pinnedRuntimeTargetForHost(facts)
  if (!target) {
    const glibc = facts.glibc ? `${facts.glibc.major}.${facts.glibc.minor}` : 'unknown'
    throw new MarkovdHostGlibcUnsupportedError(facts.target, glibc)
  }
  return target
}
