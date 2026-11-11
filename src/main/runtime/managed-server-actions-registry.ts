/** Desktop main publishes managed-server actions for runtime RPC; headless hosts without a registry advertise none. */
import type {
  MarkovdManagedPastLiveTerminals,
  MarkovdManagedCancelStopResult,
  MarkovdManagedDeployResult,
  MarkovdManagedForgetResult,
  MarkovdManagedRecoveryResult,
  MarkovdManagedRollbackResult,
  MarkovdManagedRuntimeStatus,
  MarkovdManagedStopResult
} from '../../shared/markovd-managed-runtime'

export type ManagedServerActions = {
  status: (selector: string) => Promise<MarkovdManagedRuntimeStatus>
  update: (
    selector: string,
    force: boolean,
    pastLiveTerminals?: MarkovdManagedPastLiveTerminals
  ) => Promise<MarkovdManagedDeployResult>
  rollback: (selector: string) => Promise<MarkovdManagedRollbackResult>
  /** `acceptChangedState` restores the snapshot over state a rejected build changed. */
  recover: (selector: string, acceptChangedState?: boolean) => Promise<MarkovdManagedRecoveryResult>
  stop: (selector: string) => Promise<MarkovdManagedStopResult>
  cancelStop: (selector: string) => Promise<MarkovdManagedCancelStopResult>
  forget: (selector: string) => Promise<MarkovdManagedForgetResult>
  /** Forget only while another saved entry still manages the same server. */
  forgetRedundant: (selector: string) => Promise<MarkovdManagedForgetResult>
}

let registered: ManagedServerActions | null = null

export function registerManagedServerActions(actions: ManagedServerActions | null): void {
  registered = actions
}

export function getManagedServerActions(): ManagedServerActions | null {
  return registered
}
