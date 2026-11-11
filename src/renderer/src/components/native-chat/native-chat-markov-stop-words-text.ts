import { translate } from '@/i18n/i18n'
import {
  NATIVE_CHAT_MARKOV_STOP_COPY as COPY,
  type NativeChatMarkovStopCopyId,
  type NativeChatMarkovStopSay
} from '../../../../shared/native-chat/native-chat-markov-stop-words'

const PIECES: Record<NativeChatMarkovStopCopyId, (machine: string | undefined) => string> = {
  update: (machine) =>
    translate('components.native-chat.notices.markovStopUpdate', COPY.update, { machine }),
  quit: (machine) =>
    translate('components.native-chat.notices.markovStopQuit', COPY.quit, { machine }),
  crash: (machine) =>
    translate('components.native-chat.notices.markovStopCrash', COPY.crash, { machine }),
  remote: (machine) =>
    translate('components.native-chat.notices.markovStopRemote', COPY.remote, { machine }),
  canContinue: () =>
    translate('components.native-chat.notices.markovStopCanContinue', COPY.canContinue),
  unnamedServer: () =>
    translate('components.native-chat.notices.markovStopUnnamedServer', COPY.unnamedServer)
}

export const sayNativeChatMarkovStopTranslated: NativeChatMarkovStopSay = (id, machine) =>
  PIECES[id](machine)
