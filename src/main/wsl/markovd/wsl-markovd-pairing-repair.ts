/** Use the managed SSH repair gate for refused WSL enrollment: serialize, cap attempts and require the pinned host key. Read new offers inside the local distro. */
import { resolveEnvironment } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import {
  findWslHostDeployment,
  refreshWslHostPairing
} from '../../../shared/remote-runtime/host-store/runtime-environment-wsl-host-store'
import type { KnownRuntimeEnvironment } from '../../../shared/remote-runtime/host-catalog/runtime-environments'
import { readActiveManagedMarkovdReadiness } from '../../managed-server/lifecycle/markovd-managed-bound-port'
import {
  ManagedMarkovdPairingRepairs,
  type ManagedMarkovdPairingRepairDeps
} from '../../managed-server/lifecycle/markovd-managed-pairing-repair'

import { MarkovdManagedPairingRepairFailedError } from '../../managed-server/lifecycle/markovd-managed-pairing-repair-failure'
import { notifyManagedMarkovdPairingRepaired } from '../../managed-server/lifecycle/markovd-managed-pairing-repaired-listener'
import type { WslMarkovdHostTarget } from './wsl-markovd-host-target'
import {
  type WslMarkovdHostTransport,
  createWslMarkovdHostTransport
} from './wsl-markovd-host-transport'
import type { WslMarkovdPairingRecovery } from './wsl-markovd-pairing-identity'

type WslMarkovdHostAccess = { target: WslMarkovdHostTarget; connection: WslMarkovdHostTransport }

export function liveWslMarkovdPairingRepairDeps(
  userDataPath: string
): ManagedMarkovdPairingRepairDeps<WslMarkovdHostAccess> {
  const record = (environmentId: string) => {
    const found = findWslHostDeployment(userDataPath, environmentId)
    if (!found) {
      throw new MarkovdManagedPairingRepairFailedError('this server is not a WSL host')
    }
    return found
  }
  return {
    resolve: (environmentId) => resolveEnvironment(userDataPath, environmentId),
    connect: async (environment: KnownRuntimeEnvironment) => {
      const target: WslMarkovdHostTarget = {
        kind: 'wsl',
        id: environment.id,
        distro: record(environment.id).distro,
        label: environment.name
      }
      return { target, connection: createWslMarkovdHostTransport({ target }) }
    },
    readReadiness: async (access) => {
      try {
        return await readActiveManagedMarkovdReadiness(access)
      } finally {
        access.connection.dispose()
      }
    },
    ports: (environment) => {
      const found = findWslHostDeployment(userDataPath, environment.id)
      return found ? { localPort: found.localPort, remotePort: found.remotePort } : null
    },
    refresh: (environmentId, pairingCode) => {
      const { localPort, remotePort } = record(environmentId)
      return refreshWslHostPairing(userDataPath, environmentId, {
        pairingCode,
        localPort,
        remotePort
      }).environment
    },
    repaired: notifyManagedMarkovdPairingRepaired,
    now: Date.now
  }
}

/** One gate per desktop, so the cap and a standing failure hold across every WSL connect. */
export function createWslMarkovdPairingRecovery(
  userDataPath: string,
  deps: ManagedMarkovdPairingRepairDeps<WslMarkovdHostAccess> = liveWslMarkovdPairingRepairDeps(
    userDataPath
  )
): Omit<WslMarkovdPairingRecovery, 'environmentId'> {
  return { repairs: new ManagedMarkovdPairingRepairs(deps), resolve: deps.resolve }
}
