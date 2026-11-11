import { MarkovdBindAddressError } from './markovd-bind-address'
import { MarkovdBundledRuntimeError } from './markovd-bundled-runtime'
import { MarkovdInstanceLockError } from './markovd-data-root-privacy'
import { ProfileStateAccessError } from '../persistence/profile-state/profile-state-access'
import { MARKOVD_EXIT_CONFIGURATION } from './markovd-configuration-exit'
import { SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE } from '../../shared/single-instance-exit-code'
import { MARKOVD_EXIT_TERMINALS_NOT_DURABLE } from '../../shared/serve-supervised-terminal-durability'
import { MarkovdTerminalsNotDurableError } from './markovd-serve-supervision'

export const MARKOVD_EXIT_FAILED = 1

export function resolveMarkovdExitCode(error: unknown): number {
  // Supervisors wait for an existing holder instead of abandoning the host.
  if (
    error instanceof MarkovdInstanceLockError &&
    error.code === 'markovd_instance_lock_holder_unverifiable'
  ) {
    return SINGLE_INSTANCE_ALREADY_RUNNING_EXIT_CODE
  }
  if (error instanceof MarkovdTerminalsNotDurableError) {
    return MARKOVD_EXIT_TERMINALS_NOT_DURABLE
  }
  return error instanceof MarkovdInstanceLockError ||
    error instanceof MarkovdBindAddressError ||
    error instanceof MarkovdBundledRuntimeError ||
    error instanceof ProfileStateAccessError
    ? MARKOVD_EXIT_CONFIGURATION
    : MARKOVD_EXIT_FAILED
}
