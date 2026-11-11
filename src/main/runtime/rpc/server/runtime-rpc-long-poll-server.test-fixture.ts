import { MarkovRuntimeRpcServer } from './runtime-rpc'
import { STATUS_METHODS } from '../methods/host-management/status'
import { TERMINAL_METHODS } from '../methods/terminal/terminal'
import { ORCHESTRATION_METHODS } from '../methods/orchestration/orchestration'

export function createLongPollServer(
  options: ConstructorParameters<typeof MarkovRuntimeRpcServer>[0]
) {
  return new MarkovRuntimeRpcServer({
    ...options,
    methods: [...STATUS_METHODS, ...TERMINAL_METHODS, ...ORCHESTRATION_METHODS]
  })
}
