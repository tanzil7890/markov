import { MarkovRuntimeService } from '../../../../runtime/markov-runtime'

export class ReceivingRuntime extends MarkovRuntimeService {
  override getOrchestrationDbIfAvailable() {
    return super.getOrchestrationDbIfAvailable()
  }
  mailTarget(handle: string) {
    return this.resolveStructuredMailboxTarget(handle)
  }
}
