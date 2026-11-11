import type { MarkovdManagedStopRequest } from '../../shared/markovd-stop-request'
import { persistMarkovdDaemonRetirementRecord } from './markovd-completed-stop-receipt'
import type { MarkovdDaemonRetirement } from './markovd-daemon-retirement'
import { stopMarkovdAutomationScheduler } from './markovd-automations'
import { holdMarkovdTerminalAdmissionUntilExit } from './markovd-stop-terminal-admission'

// Keep daemon imports lazy so entry loading cannot initialize native code.
async function retireLazily(): Promise<MarkovdDaemonRetirement> {
  const { retireMarkovdDaemonIfIdle } = await import('./markovd-daemon-retirement')
  return retireMarkovdDaemonIfIdle()
}

/** Record managed-stop outcomes without vetoing the stop. */
export async function prepareMarkovdManagedStop(
  request: MarkovdManagedStopRequest,
  retire: () => Promise<MarkovdDaemonRetirement> = retireLazily,
  stopAutomations: () => void = stopMarkovdAutomationScheduler,
  holdTerminalAdmission: () => void = holdMarkovdTerminalAdmissionUntilExit
): Promise<void> {
  // Fence spawns before potentially slow daemon retirement.
  holdTerminalAdmission()
  // Stop dispatch before census so new runs cannot race shutdown.
  stopAutomations()
  if (!request.retireIdleDaemon) {
    return
  }
  const outcome = await retire().catch((error: unknown): MarkovdDaemonRetirement => ({
    retirement: 'unverifiable',
    liveSessions: null,
    reason: `Retirement failed: ${error instanceof Error ? error.message : String(error)}`
  }))
  try {
    persistMarkovdDaemonRetirementRecord(request, outcome)
  } catch (error) {
    // Missing retirement records remain unverifiable to the completion reader.
    console.error('[markovd] could not record daemon retirement:', error)
  }
}
