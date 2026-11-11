import { errorMessage } from '../../shared/error-message'
import { preflightInstalledMarkovd } from '../managed-server/install/markovd-remote-preflight'

/** Preflight before any stop; asked to, the candidate also names the daemon generations under the served data root. */
export async function preflightMarkovdCandidate(
  options: Omit<Parameters<typeof preflightInstalledMarkovd>[0], 'probeDaemonsUnder'> & {
    userDataDir: string
  },
  probeDaemons: boolean
): Promise<{ hostDaemonProtocols: readonly number[] | undefined } | { failure: string }> {
  try {
    const answer = await preflightInstalledMarkovd({
      ...options,
      ...(probeDaemons ? { probeDaemonsUnder: options.userDataDir } : {})
    })
    return { hostDaemonProtocols: answer.liveDaemonProtocols ?? undefined }
  } catch (error) {
    options.signal?.throwIfAborted()
    return {
      failure: `Candidate profile preflight failed; the incumbent was not stopped: ${errorMessage(error)}`
    }
  }
}
