import { getAppEnvironment } from '../../../shared/app-environment'
import {
  getManagedMarkovdFenceEnvironmentId,
  managedMarkovdServerName
} from '../../../shared/managed-markovd-ssh-owner'
import { listEnvironments } from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { findMarkovdMigrationSourceCutoverForTarget } from '../../ssh/markovd-migration-cutover-journal'
import { abandonMarkovdConversion } from '../../ssh/markovd-conversion-abandon'
import { retainMarkovdMigrationSource } from '../../ssh/markovd-migration-source-retention'
import { enableMovedMarkovdAutomationsForTarget } from '../../ssh/markovd-migration-moved-automations'
import { hasMarkovdTemplate } from '../../markovd/markovd-artifact-materializer'
import { isMarkovdHostUnavailableFixableOnHost } from '../../markovd/markovd-host-unavailable'
import { managedServerUpdateDeps } from '../../ssh/managed-server-update-deps'
import { ensureMarkovdManagedTunnel } from '../../managed-server/lifecycle/markovd-managed-tunnel'
import { verifyMarkovdManagedServing } from '../../managed-server/lifecycle/markovd-managed-serving-verify'
import { convertSshTargetToManagedMarkovd } from '../../managed-server/lifecycle/markovd-runtime-conversion'
import {
  markovdMigrationDestinationFor,
  markovdServerAutomationEnablerFor,
  markovdServerFolderCatalogFor,
  markovdServerRepositoriesFor
} from '../../managed-server/lifecycle/markovd-runtime-conversion-wiring'
import { createManagedMarkovdEnvironment } from '../../managed-server/lifecycle/markovd-runtime-deployment'
import type { HostServerOnConnectDeps } from '../../ssh/ssh-host-server-on-connect'
import {
  censusSshHostRelaysBeforeSession,
  relayTerminalsOnConnect
} from '../../ssh/legacy-relay/ssh-host-relay-terminals-on-connect'
import { requireManagedMarkovdInfrastructure } from '../../managed-server/lifecycle/markovd-managed-runtime-context'
import { censusHostRelayTerminalsFor } from '../../ssh/legacy-relay/ssh-host-relay-census-for-target'
import { setSshHostServerStatus } from '../../ssh/ssh-host-server-status'
import { trackSshHostServerEvent } from '../../ssh/ssh-host-server-telemetry'
import { knownSshHostPlatform } from '../../ssh/ssh-host-platform-memo'
import { knownMarkovdTunnelTransport } from '../../ssh/markovd-tunnel-transport-memo'
import { getSshTargetRegistryStore } from '../../ssh/targets/ssh-target-registry'
import { releaseUnreachableMarkovdSetup } from '../../ssh/markovd-unreachable-setup-release'
import { getCurrentMainWindow } from './ssh-ipc-context'
import { broadcastSshState } from './ssh-renderer-broadcast'
import { connectInFlight } from './ssh-connect-attempt-registry'
import { startLegacyRelayBridge } from '../../ssh/legacy-relay/legacy-relay-bridge-registry'
import { isBridgeableLease } from '../../ssh/legacy-relay/legacy-relay-bridge-leases'

export function hostServerOnConnectDeps(userDataPath: string): HostServerOnConnectDeps {
  const registry = getSshTargetRegistryStore()!
  const claims = registry.getMarkovdRuntimeClaims()
  const store = registry.getMarkovdMigrationSource()
  const appVersion = getAppEnvironment().getVersion()
  const isRegistered = (environmentId: string): boolean =>
    listEnvironments(userDataPath).some((entry) => entry.id === environmentId)
  return {
    // A fence alone may be unfinished setup; only registered servers count.
    managedEnvironmentId: (target) => {
      const environmentId = getManagedMarkovdFenceEnvironmentId(target)
      return environmentId && isRegistered(environmentId) ? environmentId : null
    },
    ensureTunnel: async (environmentId) => {
      await ensureMarkovdManagedTunnel(userDataPath, environmentId)
    },
    ensureServing: (environmentId) => verifyMarkovdManagedServing(userDataPath, environmentId),
    retainCommittedSource: async (target) => {
      const head = findMarkovdMigrationSourceCutoverForTarget(userDataPath, target.id)
      if (head?.phase !== 'destination-committed') {
        return 0
      }
      await retainMarkovdMigrationSource(userDataPath, head.migrationId, store)
      // Retry what earlier connects could not reach the server to re-enable.
      const environment = listEnvironments(userDataPath).find(
        (entry) => entry.id === head.destinationEnvironmentId
      )
      return environment
        ? enableMovedMarkovdAutomationsForTarget(
            userDataPath,
            target.id,
            markovdServerAutomationEnablerFor(environment)
          )
        : 0
    },
    hasTemplate: hasMarkovdTemplate,
    recordedUnavailable: (target) =>
      target.managedServerUnavailable?.appVersion === appVersion
        ? target.managedServerUnavailable.reason
        : null,
    recordUnavailable: (target, reason) => {
      if (!isMarkovdHostUnavailableFixableOnHost(reason)) {
        registry.updateTarget(target.id, { managedServerUnavailable: { reason, appVersion } })
      }
    },
    ...managedServerUpdateDeps(userDataPath),
    isEmptyHost: (target) => {
      // An interrupted empty-host deploy passes its own claim, recorded by its provisioning intent.
      const environmentId = getManagedMarkovdFenceEnvironmentId(target)
      return claims.preflight(
        target.id,
        environmentId
          ? { environmentId, recorded: target.markovdProvisioning !== undefined }
          : undefined
      ).claimable
    },
    relayTerminals: (target) =>
      relayTerminalsOnConnect({
        store,
        targetId: target.id,
        censusHost: async () =>
          censusSshHostRelaysBeforeSession(
            await requireManagedMarkovdInfrastructure().connectionManager.connect(target),
            target.id
          )
      }),
    deploy: (target) =>
      createManagedMarkovdEnvironment(userDataPath, {
        name: target.markovdProvisioning?.name ?? managedMarkovdServerName(target),
        sshTargetId: target.id
      }),
    convert: async (target, hostProof) => {
      // COMPAT(legacy-relay-bridge): find the panes old relays still run before the tabs remount.
      if (hostProof?.bridged) {
        await startLegacyRelayBridge(target.id)
      }
      const converted = await convertSshTargetToManagedMarkovd(userDataPath, {
        sshTargetId: target.id,
        name: managedMarkovdServerName(target),
        // The connect's own census already answered; a conversion before any session reuses it.
        censusHost: (host) =>
          hostProof ? Promise.resolve(hostProof) : censusHostRelayTerminalsFor(host)(),
        isBridgedPaneLease: isBridgeableLease,
        // Releasing the direct session here would cancel the connect that requested conversion.
        destinationFor: markovdMigrationDestinationFor,
        serverRepositoriesFor: markovdServerRepositoriesFor,
        serverFolderCatalogFor: markovdServerFolderCatalogFor,
        serverAutomationEnablerFor: markovdServerAutomationEnablerFor
      })
      if (converted.outcome === 'converted' || converted.outcome === 'refused') {
        // Move-anyway consent covers one attempt; retain it on failure so held-fence verification can resume.
        registry.updateTarget(target.id, { managedServerLeaveBehind: undefined })
      }
      return converted
    },
    abandonDeploy: async (target) => {
      const environmentId =
        getManagedMarkovdFenceEnvironmentId(target) ??
        getManagedMarkovdFenceEnvironmentId(registry.getTarget(target.id))
      if (environmentId && !isRegistered(environmentId)) {
        claims.release(target.id, environmentId)
        await claims.flush()
      }
    },
    hasUnfinishedConversion: (target) => {
      const head = findMarkovdMigrationSourceCutoverForTarget(userDataPath, target.id)
      return (
        head !== null &&
        !head.supersedesMigrationId &&
        (head.phase === 'source-fenced' || head.phase === 'destination-staged')
      )
    },
    abandonConversion: async (target) => {
      await abandonMarkovdConversion({
        userDataPath,
        store,
        claims,
        targetId: target.id,
        destinationFor: markovdMigrationDestinationFor
      })
    },
    isFencedBeforeStaging: (target) =>
      findMarkovdMigrationSourceCutoverForTarget(userDataPath, target.id)?.phase ===
      'source-fenced',
    releaseUnreachableSetup: (target) =>
      releaseUnreachableMarkovdSetup({ userDataPath, claims, targetId: target.id }),
    // Read at report time: a deploy or conversion learns the platform while the decision runs.
    report: (target, event) =>
      trackSshHostServerEvent(
        event,
        knownSshHostPlatform(target.id),
        knownMarkovdTunnelTransport(target.id)
      ),
    progress: (target, phase) => {
      // Cancelled decisions keep running; their progress must not revive connection status.
      if (!connectInFlight.has(target.id)) {
        return
      }
      setSshHostServerStatus(target.id, { kind: 'setting-up', phase })
      broadcastSshState(getCurrentMainWindow, target.id, {
        targetId: target.id,
        status: 'connecting',
        error: null,
        reconnectAttempt: 0
      })
    }
  }
}
