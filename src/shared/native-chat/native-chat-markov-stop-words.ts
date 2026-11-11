import type { AgentSessionMarkovStopCause } from '../agent-session/lifecycle/agent-session-markov-stop'
import { joinSentences } from '../sentence-joining'

/** English pieces; desktop translates each with the same fallback, the phone keeps English. */
export const NATIVE_CHAT_MARKOV_STOP_COPY = {
  update: 'Markov on {{machine}} restarted for an update while this response was in progress.',
  quit: 'Markov on {{machine}} was closed while this response was in progress.',
  crash: 'Markov on {{machine}} stopped unexpectedly while this response was in progress.',
  // A remote graceful stop is a server stop or a shared desktop's quit; "stopped" is true of both.
  remote: 'Markov on {{machine}} stopped while this response was in progress.',
  canContinue: 'You can continue in this conversation.',
  unnamedServer: 'the remote server'
} as const

export type NativeChatMarkovStopCopyId = keyof typeof NATIVE_CHAT_MARKOV_STOP_COPY
export type NativeChatMarkovStopSay = (id: NativeChatMarkovStopCopyId, machine?: string) => string

export const sayNativeChatMarkovStopEnglish: NativeChatMarkovStopSay = (id, machine) =>
  machine === undefined
    ? NATIVE_CHAT_MARKOV_STOP_COPY[id]
    : NATIVE_CHAT_MARKOV_STOP_COPY[id].replace('{{machine}}', () => machine)

/** Base wording on host continuation support so the sentence stays stable as the button changes. */
export function nativeChatMarkovStopRowText(
  cause: AgentSessionMarkovStopCause,
  machine: string,
  options: { continueAvailable: boolean; remoteHost: boolean },
  say: NativeChatMarkovStopSay = sayNativeChatMarkovStopEnglish
): string {
  const stopped = say(cause === 'quit' && options.remoteHost ? 'remote' : cause, machine)
  return options.continueAvailable ? stopped : joinSentences([stopped, say('canContinue')])
}
