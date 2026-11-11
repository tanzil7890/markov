import type { RuntimeNotifier } from '../../runtime-notifier-contract'
import { MarkovRuntimeWithPtyController } from '../../markov-runtime-pty-controller'

export abstract class RuntimeNotifierBinding extends MarkovRuntimeWithPtyController {
  setNotifier(notifier: RuntimeNotifier | null): void {
    this.notifier = notifier
    if (notifier) {
      this.repositoryForkBackfill.start()
    }
  }

  protected countTerminalSideEffectConsumingClientEventListeners(): number {
    return this.clientEvents.countTerminalSideEffectConsumers()
  }
}
