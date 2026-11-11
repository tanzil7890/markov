import type { NativeChatMarkovStopSay } from '../../../../../src/shared/native-chat/native-chat-markov-stop-words'
import type { Translate } from '../../../i18n/mobile-i18n'

export function nativeChatMarkovStopSay(t: Translate): NativeChatMarkovStopSay {
  return (id, machine) => {
    const copy = {
      update: () =>
        t(
          'chat.markovStop.update',
          'Markov on {{machine}} restarted for an update while this response was in progress.',
          { machine }
        ),
      quit: () =>
        t(
          'chat.markovStop.quit',
          'Markov on {{machine}} was closed while this response was in progress.',
          { machine }
        ),
      crash: () =>
        t(
          'chat.markovStop.crash',
          'Markov on {{machine}} stopped unexpectedly while this response was in progress.',
          { machine }
        ),
      remote: () =>
        t(
          'chat.markovStop.remote',
          'Markov on {{machine}} stopped while this response was in progress.',
          { machine }
        ),
      canContinue: () => t('chat.markovStop.canContinue', 'You can continue in this conversation.'),
      unnamedServer: () => t('chat.markovStop.unnamedServer', 'the remote server')
    }
    return copy[id]()
  }
}
