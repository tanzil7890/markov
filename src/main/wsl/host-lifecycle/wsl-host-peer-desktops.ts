/** R39: a WSL host's server lives in the Linux login's ~/.markov, so another Markov on this computer may share it. */
import { z } from 'zod'
import { MARKOVD_PEER_DESKTOPS_RUNTIME_CAPABILITY } from '../../../shared/markovd-runtime-capabilities'
import {
  MARKOVD_PEER_DESKTOPS_METHOD,
  MarkovdPeerDesktopsResultSchema
} from '../../../shared/markovd-peer-desktops-contract'
import { wslHostClientInstanceId } from './wsl-host-client-instance'

export type WslHostPeerDesktops =
  | { kind: 'none' }
  | { kind: 'shared'; names: string[] }
  /** An older server can't say: Remove keeps today's teardown. */
  | { kind: 'unsupported' }

const StatusCapabilitiesSchema = z.looseObject({ capabilities: z.array(z.string()).optional() })

/**
 * Another Markov counts only while its control socket is open on the server right now; a closed one
 * isn't protected. Throws when the server can't answer, so the caller refuses the teardown.
 */
export async function readWslHostPeerDesktops(
  call: (method: string, params: unknown) => Promise<unknown>,
  clientInstanceId = wslHostClientInstanceId()
): Promise<WslHostPeerDesktops> {
  const status = StatusCapabilitiesSchema.parse(await call('status.get', undefined))
  if (!status.capabilities?.includes(MARKOVD_PEER_DESKTOPS_RUNTIME_CAPABILITY)) {
    return { kind: 'unsupported' }
  }
  const { peers } = MarkovdPeerDesktopsResultSchema.parse(
    await call(MARKOVD_PEER_DESKTOPS_METHOD, { clientInstanceId })
  )
  return peers.length > 0
    ? { kind: 'shared', names: peers.map((peer) => peer.name) }
    : { kind: 'none' }
}
