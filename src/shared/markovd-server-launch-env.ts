import { MARKOVD_IDLE_TIMEOUT_ENV } from './markovd-idle-exit'
import { MARKOVD_MANAGED_ACTIVATION_ROOT_ENV } from './markovd-managed-launch-env'

/** WSL-host launch marker; SSH guests and WSLg retain their original PATH. */
export const MARKOVD_WSL_HOST_ENV = 'MARKOV_WSL_MARKOVD_HOST'

/** Desktop-provided registry ID; guests cannot read it themselves. */
export const MARKOVD_WSL_DISTRO_GUID_ENV = 'MARKOV_WSL_DISTRO_GUID'

/**
 * What a client puts in a server's launch env. A user's own `markovd` started from one of the
 * server's shells is not that server, so every pane scrubs these.
 */
export const MARKOVD_SERVER_LAUNCH_ENV_KEYS = [
  // Not client-managed.
  MARKOVD_MANAGED_ACTIVATION_ROOT_ENV,
  // Keeps the default idle window.
  MARKOVD_IDLE_TIMEOUT_ENV,
  // Not a WSL host: no migration capabilities, no /mnt/c refusal, no account-push wait.
  MARKOVD_WSL_HOST_ENV,
  MARKOVD_WSL_DISTRO_GUID_ENV
] as const
