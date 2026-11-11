import type { MarkovRuntimeService } from '../runtime/markov-runtime'
import type { MarkovdRuntimeCleanup } from './markovd-runtime-lifetime'
import { EmulatorBridge } from '../emulator/emulator-bridge'
import { withTimeout } from '../../shared/promise-timeout-fallback'

// A stalled adb must not hold the final profile flush past markovd's shutdown deadline.
const EMULATOR_TEARDOWN_BUDGET_MS = 3_000

/** Android drives adb/emulator on any host; iOS backends report their own host-support errors. */
export function installMarkovdEmulatorBridge(
  runtime: MarkovRuntimeService,
  registerCleanup: (cleanup: MarkovdRuntimeCleanup) => void
): void {
  const bridge = new EmulatorBridge()
  runtime.setEmulatorBridge(bridge)
  // Like desktop quit: stop the helpers and devices Markov started.
  registerCleanup(() =>
    withTimeout(bridge.destroyAllSessions(), EMULATOR_TEARDOWN_BUDGET_MS, undefined)
  )
}
