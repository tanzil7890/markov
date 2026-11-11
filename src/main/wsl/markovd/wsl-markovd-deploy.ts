/** D1/D2b/D8 reuse SSH installation, activation journals/fences and admission over wsl.exe. C5 pairs through the reported loopback port. */
import { getAppEnvironment } from '../../../shared/app-environment'
import { MARKOVD_MANAGED_REMOTE_PORT } from '../../../shared/markovd-managed-runtime'
import type { ServeReadiness } from '../../server/serve-readiness'
import type { WslHostDeferredUpdate } from '../../../shared/wsl-host-types'
import { recoverInterruptedMarkovdActivation } from '../../managed-server/activation/markovd-activation-recovery'
import { readMarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record-store'
import { materializeMarkovdArtifact } from '../../markovd/markovd-artifact-materializer'
import type { MarkovdHostTransport } from '../../ssh/markovd-host-transport'
import { MARKOVD_ACTIVATION_POLICY_REFUSED_CODE } from '../../ssh/markovd-installed-activation'
import { markovdBoundPort } from '../../managed-server/lifecycle/markovd-managed-bound-port'
import {
  isForceableMarkovdDeferral,
  managedMarkovdDeployPolicy,
  managedMarkovdSlot
} from '../../managed-server/lifecycle/markovd-managed-runtime-context'
import { isWaitingMarkovdUpdateDeferral } from '../../managed-server/lifecycle/markovd-managed-auto-update'
import { clearMarkovdUpdateFailedThisLaunch } from '../../managed-server/lifecycle/markovd-managed-update-failure-memory'
import type { MarkovdUpdateIntent } from '../../managed-server/lifecycle/markovd-managed-update-decision'
import type { MarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record'
import { errorMessage } from '../../../shared/error-message'
import { pruneWslMarkovdVersionsUntilClean } from './wsl-markovd-version-gc-memo'
import { pruneSupersededMarkovdCandidates } from '../../managed-server/lifecycle/markovd-managed-version-gc'
import { wakeAlreadyActiveMarkovd } from '../../ssh/markovd-already-active-wake'
import { MarkovdActiveReadinessError } from '../../ssh/markovd-active-readiness'
import { WslDistroNotRunningError } from './wsl-markovd-connection-errors'
import { deployMarkovd, type MarkovdDeployOptions } from '../../ssh/markovd-remote-deploy'
import { isWslMoveUnderwayOnHost } from '../../persistence/moving-wsl-projects/wsl-move-running-moves'
import { readLocalFullVersion } from '../../managed-server/install/remote-versioned-install'
import { createWslDistroHolder } from '../discovery/wsl-distro-holder'
import { wslDistroHolderKey } from '../discovery/wsl-distro-holder-record'
import { readWslDistroRegistryIdShared } from '../discovery/wsl-distro-registry-id'
import type { WslMarkovdHostTarget } from './wsl-markovd-host-target'
import type { WslMarkovdDeployOptions } from './wsl-markovd-deploy-options'
import {
  createWslMarkovdHostTransport,
  type WslMarkovdHostTransport
} from './wsl-markovd-host-transport'
import { holdWslDistroWithContext } from './wsl-markovd-held-context'
import { deployWslMarkovdWithOneFence } from './wsl-markovd-one-fence-deploy'
import { removeFailedFreshWslMarkovdInstall } from './wsl-markovd-failed-install-removal'
import { probeWslActiveMarkovd, readWslMarkovdPid } from './wsl-markovd-active-probe'
import { wslMarkovdConnectStateHints } from './wsl-markovd-connect-state-snapshot'
import { readWslMarkovdIncumbent, type WslMarkovdIncumbent } from './wsl-markovd-incumbent'
import { adoptUnrecordedWslMarkovd } from './wsl-markovd-instance-adoption'
import {
  admitWslMarkovdLaunch,
  readRestoredWslMarkovdRecord,
  recordWslMarkovdUpdateFailure,
  wslMarkovdDeferralCode,
  wslMarkovdDeferralFailure
} from './wsl-markovd-update-admission'
import { withOwnBuildLaunchEnv } from './wsl-markovd-own-build-launch-env'
import { WSL_NODE_RUNTIME_DOWNLOAD_BUDGET } from '../execution/wsl-node-runtime-download-budget'

/** An update this app carries that the host may not take yet; the incumbent keeps serving. */
export type WslMarkovdDeferredUpdate = WslHostDeferredUpdate

export type WslMarkovdLaunch =
  | {
      outcome: 'ready'
      distro: string
      /** The Lxss registration GUID for the deployment record's `distroId`; null if unreadable. */
      distroId: string | null
      /** The loopback port markovd bound inside the distro (another one when the preferred was taken). */
      port: number
      fullVersion: string
      pid: number | null
      readiness: ServeReadiness
      holder: 'adopted' | 'spawned' | 'unverifiable'
      /** A markovd the record did not name (e.g. left by a failed Remove), now recorded. */
      adoptedInstance?: { version: string; pid: number }
      /** Set when `fullVersion` is the incumbent because the update must wait. */
      deferredUpdate?: WslMarkovdDeferredUpdate
    }
  | ({ outcome: 'deferred'; distro: string } & WslMarkovdDeferredUpdate)

/** Until the persisted deployment record (C7) assigns one, the environment is keyed per distro. */
export function defaultWslMarkovdEnvironmentId(distro: string): string {
  return `wsl:${wslDistroHolderKey(distro)}`
}

export async function deployAndLaunchWslMarkovd(
  distro: string,
  options: WslMarkovdDeployOptions = {}
): Promise<WslMarkovdLaunch> {
  const name = distro.trim()
  if (!name) {
    throw new Error('A WSL distro name is required')
  }
  const target: WslMarkovdHostTarget = {
    kind: 'wsl',
    id: options.environmentId ?? defaultWslMarkovdEnvironmentId(name),
    distro: name,
    label: options.label ?? name
  }
  const conn = (options.createTransport ?? defaultTransport)(target)
  try {
    return await launchOverTransport(name, target, conn, options)
  } finally {
    conn.dispose?.()
  }
}

async function launchOverTransport(
  name: string,
  target: WslMarkovdHostTarget,
  transport: MarkovdHostTransport,
  options: WslMarkovdDeployOptions
): Promise<WslMarkovdLaunch> {
  const { signal } = options
  let ownBuildVersion: string | null = null
  // Set by the serving probe; readyLaunch reads the pid itself for any other version.
  let probed: { fullVersion: string; pid: number | null } | null = null
  const conn = withOwnBuildLaunchEnv(transport, () => ownBuildVersion)
  // Acquire a holder before launch or WSL can idle-stop markovd's distro.
  const holder = options.holder ?? createWslDistroHolder({ userDataPath: userDataPath() })
  // Read GUID alongside deploy; failure leaves the record without one.
  const distroId = (options.readRegistryId ?? readWslDistroRegistryIdShared)(name).catch(() => null)
  const first = await holdWslDistroWithContext(name, target, conn, holder, signal)
  const { held, connectState } = first
  let context = first.context
  const hints = wslMarkovdConnectStateHints(connectState, context.activationRecord)
  const slot = managedMarkovdSlot(context, MARKOVD_MANAGED_REMOTE_PORT, signal)
  const recovery = await recoverInterruptedMarkovdActivation(slot, connectState ?? undefined)
  if (recovery.outcome === 'pending' || recovery.outcome === 'refused') {
    throw new Error(recovery.reason)
  }
  if (recovery.outcome === 'recovered') {
    context = { ...context, activationRecord: await readMarkovdActivationRecord(slot) }
  }
  // Adopt unrecorded markovd before deploy/wake or its instance lock blocks launch.
  const adoption = await adoptUnrecordedWslMarkovd(
    slot,
    context.activationRecord,
    undefined,
    hints.instanceLock(context.activationRecord)
  )
  if (adoption.outcome === 'adopted') {
    context = { ...context, activationRecord: adoption.record }
  }
  const localMarkovdDir = await materializeMarkovdArtifact(context.serverTarget, {
    signal,
    trustVerificationRecord: true,
    ...(options.templateDir ? { templateDir: options.templateDir } : {})
  })
  const appVersion = getAppEnvironment().getVersion()
  const candidateVersion = readLocalFullVersion(localMarkovdDir)
  ownBuildVersion = candidateVersion
  const failureHost = { kind: 'wsl', id: target.id } as const
  const intent = options.intent ?? 'connect'
  const admit = (record: MarkovdActivationRecord, admitIntent: MarkovdUpdateIntent) =>
    admitWslMarkovdLaunch(
      {
        slot,
        record,
        candidateVersion,
        appVersion,
        host: failureHost,
        intent: admitIntent,
        moveRunning: isWslMoveUnderwayOnHost(userDataPath(), name)
      },
      name,
      readyLaunch
    )
  const admitted = await admit(context.activationRecord, intent)
  if ('outcome' in admitted) {
    return admitted
  }
  context = { ...context, activationRecord: admitted }
  const incumbentVersion = context.activationRecord.active
  // Only version changes need incumbent census; same-version connects deploy as no-ops.
  const incumbent: WslMarkovdIncumbent | null =
    incumbentVersion && incumbentVersion !== candidateVersion
      ? await (options.readIncumbent ?? readWslMarkovdIncumbent)({
          context,
          slot,
          paired: options.pairedOffer ?? null
        })
      : null
  const deployOnce = (extra: Partial<MarkovdDeployOptions>) =>
    deployMarkovd({
      ...slot,
      conn,
      localMarkovdDir,
      target: context.serverTarget,
      ...managedMarkovdDeployPolicy(context, appVersion, intent),
      ...(incumbent
        ? {
            census: incumbent.census,
            recountCensus: incumbent.recount,
            releaseIncumbentAdmission: incumbent.releaseAdmission
          }
        : {}),
      force: intent === 'force',
      appVersion,
      recordedNodeRuntimeProbe: true,
      nodeRuntimeDownload: WSL_NODE_RUNTIME_DOWNLOAD_BUDGET,
      ...extra
    }).catch((error: unknown) => {
      if (!signal?.aborted) {
        recordWslMarkovdUpdateFailure(failureHost, incumbentVersion, {
          code: 'markovd_update_failed',
          reason: errorMessage(error)
        })
      }
      throw error
    })
  const { deployed, woken } = await deployWslMarkovdWithOneFence(
    slot,
    deployOnce,
    hints.deployPreRead(context.activationRecord)
  )
  if (deployed.outcome === 'installed-not-activated') {
    await removeFailedFreshWslMarkovdInstall(slot, deployed)
    const failure = wslMarkovdDeferralFailure(deployed)
    recordWslMarkovdUpdateFailure(failureHost, incumbentVersion, failure)
    const restored =
      incumbentVersion && failure
        ? await readRestoredWslMarkovdRecord(slot, incumbentVersion)
        : null
    if (restored) {
      // After rollback proof, serve the restored incumbent on this connect too.
      const retried = await admit(restored, 'connect')
      if ('outcome' in retried) {
        return retried
      }
    }
    const deferredUpdate: WslMarkovdDeferredUpdate = {
      candidateVersion: deployed.fullVersion,
      code: await wslMarkovdDeferralCode(slot, deployed, appVersion),
      reason: deployed.reason,
      forceable:
        isForceableMarkovdDeferral(deployed.code) ||
        deployed.code === MARKOVD_ACTIVATION_POLICY_REFUSED_CODE
    }
    // Live-terminal deferrals keep the incumbent serving until Update/Force.
    if (
      incumbentVersion &&
      incumbent?.readiness &&
      isWaitingMarkovdUpdateDeferral(deployed.code) &&
      // Another client may have activated since census; refuse stale incumbent assumptions.
      (await readMarkovdActivationRecord(slot)).active === incumbentVersion
    ) {
      const serving = {
        fullVersion: incumbentVersion,
        readiness: incumbent.readiness
      }
      await pruneSupersededMarkovdCandidates(slot, context.serverTarget, deployed.fullVersion)
      return { ...(await readyLaunch(serving)), deferredUpdate }
    }
    return { outcome: 'deferred', distro: name, ...deferredUpdate }
  }
  clearMarkovdUpdateFailedThisLaunch(failureHost)
  const probe = async () => {
    const answer = await probeWslActiveMarkovd(
      context,
      localMarkovdDir,
      deployed.fullVersion,
      signal
    )
    probed = { fullVersion: deployed.fullVersion, pid: answer.pid }
    return answer.readiness
  }
  let readiness: ServeReadiness
  if (deployed.outcome === 'already-active') {
    // A stopped distro ended the active slot with it; the one-fence deploy already woke it.
    await (woken ? null : wakeAlreadyActiveMarkovd(slot))
    // Why once more: on a distro still booting, the markovd the wake saw serving can exit before
    // the probe; that is a stopped slot to start, not a failed connect.
    readiness = await probe().catch(async (error: unknown) => {
      if (!(error instanceof MarkovdActiveReadinessError) || error.verdict !== 'exited') {
        throw error
      }
      // A `wsl --shutdown` during a no-boot connect must not be undone by this second wake.
      if (options.requireRunning && !(await options.requireRunning())) {
        throw new WslDistroNotRunningError(name)
      }
      await wakeAlreadyActiveMarkovd(slot)
      return probe()
    })
  } else {
    readiness = await probe()
  }
  await pruneWslMarkovdVersionsUntilClean(target.id, {
    slot,
    serverTarget: context.serverTarget,
    activeVersion: deployed.fullVersion,
    readiness
  })
  return readyLaunch({ fullVersion: deployed.fullVersion, readiness })

  async function readyLaunch(serving: {
    fullVersion: string
    readiness: ServeReadiness
  }): Promise<Extract<WslMarkovdLaunch, { outcome: 'ready' }>> {
    // The serving probe already read it; an admission that serves an incumbent did not.
    const pid =
      probed?.fullVersion === serving.fullVersion
        ? probed.pid
        : await readWslMarkovdPid(context, serving.fullVersion, signal)
    return {
      outcome: 'ready',
      distro: name,
      distroId: await distroId,
      port: markovdBoundPort(serving.readiness) ?? MARKOVD_MANAGED_REMOTE_PORT,
      fullVersion: serving.fullVersion,
      pid,
      readiness: serving.readiness,
      holder: held.outcome,
      ...(adoption.outcome === 'adopted'
        ? { adoptedInstance: { version: adoption.version, pid: adoption.pid } }
        : {})
    }
  }
}

function defaultTransport(target: WslMarkovdHostTarget): WslMarkovdHostTransport {
  return createWslMarkovdHostTransport({ target })
}

function userDataPath(): string {
  return getAppEnvironment().getPath('userData')
}
