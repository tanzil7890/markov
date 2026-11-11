import type { Store } from '../persistence/loading-store/store'
import type { MarkovRuntimeService } from '../runtime/markov-runtime'
import { createRuntimeAutomationService } from '../automations/runtime-automation-service'
import { isFinalAutomationRunStatus } from '../../shared/automations-types'

type AutomationStore = Pick<Store, 'listAutomations' | 'listAutomationRuns'>

let stopScheduler: (() => void) | null = null

export function startMarkovdAutomations(
  runtime: MarkovRuntimeService,
  store: Store,
  registerCleanup: (cleanup: () => void) => void
): void {
  const service = createRuntimeAutomationService({ store, runtime, headless: true })
  stopScheduler = () => service.stop()
  // Stop before final profile flush so runs cannot persist afterward.
  registerCleanup(() => service.stop())
  service.start()
}

export function stopMarkovdAutomationScheduler(): void {
  stopScheduler?.()
}

/** Pending schedules/runs must keep the host alive. */
export function markovdAutomationsKeepHostBusy(store: AutomationStore): boolean {
  return (
    store.listAutomations().some((automation) => automation.enabled) ||
    store.listAutomationRuns().some((run) => !isFinalAutomationRunStatus(run.status))
  )
}
