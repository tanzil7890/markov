// Resumed stale holders must prove their generation on-host before every step, preventing writes or release under a successor's fence.
import { AsyncLocalStorage } from 'node:async_hooks'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { isSshCommandExitError } from '../../ssh/remote-exec/remote-exec-command'

export const MARKOVD_FENCE_OWNER_FILENAME = '.markov-fence-owner'
export const MARKOVD_FENCE_LOST_MARKER = '__MARKOVD_FENCE_LOST__'
/** EX_TEMPFAIL: this superseded generation cannot retry its step. */
export const MARKOVD_FENCE_LOST_EXIT = 75

export type MarkovdFence = { lockDir: string; token: string }

const scope = new AsyncLocalStorage<MarkovdFence>()

export function runWithMarkovdFence<T>(fence: MarkovdFence, run: () => Promise<T>): Promise<T> {
  return scope.run(fence, run)
}

export function currentMarkovdFence(): MarkovdFence | null {
  return scope.getStore() ?? null
}

export class MarkovdFenceLostError extends Error {
  constructor() {
    super(
      "This run's activation fence was taken over by another run, so it stopped before changing the host."
    )
    this.name = 'MarkovdFenceLostError'
  }
}

export function posixMarkovdFenceOwnedTest(fence: MarkovdFence): string {
  const owner = quotePosixShell(
    `${fence.lockDir.replace(/\/+$/u, '')}/${MARKOVD_FENCE_OWNER_FILENAME}`
  )
  return `[ "$(cat ${owner} 2>/dev/null)" = ${quotePosixShell(fence.token)} ]`
}

export function posixMarkovdFenceGuard(fence: MarkovdFence): string {
  return `${posixMarkovdFenceOwnedTest(fence)} || { echo ${MARKOVD_FENCE_LOST_MARKER}; exit ${MARKOVD_FENCE_LOST_EXIT}; };`
}

/** Use exit status and stdout; error messages quote commands containing the marker even when no guard failed. */
export function isMarkovdFenceLost(error: unknown): boolean {
  if (!isSshCommandExitError(error)) {
    return false
  }
  // `powershell -Command` reports any nonzero native exit as 1.
  const exited = error.exitCode === MARKOVD_FENCE_LOST_EXIT || error.exitCode === 1
  return exited && error.stdout.trim().split(/\r?\n/u).at(-1) === MARKOVD_FENCE_LOST_MARKER
}
