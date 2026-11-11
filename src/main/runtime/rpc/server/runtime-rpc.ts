// Why: the single security boundary for the bundled CLI — auth-token enforcement, metadata publication, transport orchestration.
import { RuntimeRpcShutdown } from './runtime-rpc-shutdown'
import type { MarkovRuntimeRpcServerOptions } from './runtime-rpc-pairing-types'

export class MarkovRuntimeRpcServer extends RuntimeRpcShutdown {
  constructor(options: MarkovRuntimeRpcServerOptions) {
    super(options)
  }
}
