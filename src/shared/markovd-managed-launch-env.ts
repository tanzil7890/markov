/** Managed launches alone enable idle exit and name the activation fence that keeps updates/rollbacks alive.
 * Dependency-free so the markovd launcher can read it. */
export const MARKOVD_MANAGED_ACTIVATION_ROOT_ENV = 'MARKOV_MARKOVD_MANAGED_ACTIVATION_ROOT'

/** Host login env naming a machine's own managed-server data on a shared home; clones copy /etc/machine-id. */
export const MARKOV_MACHINE_NAME_ENV = 'MARKOV_MACHINE_NAME'
