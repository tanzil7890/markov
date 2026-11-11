import { MARKOV_LAYOUT_OWNER_IS_MAIN } from '../../shared/layout-owner-switch'
import type { MarkovRuntimeService } from '../runtime/markov-runtime'
import type { MarkovdFeatureReadiness } from '../runtime/rpc/markovd-feature-readiness'
import { placeUnshownLiveTerminalsBestEffort } from '../runtime/terminal/adoption/unshown-live-terminal-placement'
import type { createMarkovdStartupTiming } from './markovd-startup-timing'

/** Restored orchestration authority, the legacy terminal reconcile and unshown placement, in order. */
export async function restoreMarkovdTerminalAuthority(
  runtime: MarkovRuntimeService,
  timed: ReturnType<typeof createMarkovdStartupTiming>['time'],
  readiness: MarkovdFeatureReadiness
): Promise<void> {
  await timed('orchestration', () => runtime.refreshRestoredOrchestrationAuthority())
  readiness.open('orchestration')
  // Terminal inventory stays on the critical path: no latch, every client needs it at connect.
  await timed('reconcile-terminals', () => runtime.reconcileLegacyWorkerTerminals())
  if (MARKOV_LAYOUT_OWNER_IS_MAIN) {
    await placeUnshownLiveTerminalsBestEffort(runtime)
  }
  readiness.open('unshownPlacement')
}
