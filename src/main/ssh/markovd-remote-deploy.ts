/** Activate under a durable host fence/journal only after candidate readiness. Recover the incumbent only with safe profile state; retain changed state/snapshot for explicit recovery. */
import { logMarkovdActivationOutcome } from '../managed-server/activation/markovd-activation-outcome-log'
import { join } from 'node:path'
import type { MarkovdHostTransport } from './markovd-host-transport'
import type { MarkovdUpdateForce } from './markovd-update-plan'
import { MARKOVD_INSTALL_MODEL } from '../managed-server/install/remote-install-model'
import {
  computeRemoteInstallDir,
  readLocalFullVersion
} from '../managed-server/install/remote-versioned-install'
import { readMarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record-store'
import type { MarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record'
import type { MarkovdActivationVerdict } from '../managed-server/activation/markovd-activation-gate'
import type { MarkovdTerminalCensus } from '../../shared/markovd-terminal-census'
import type { RemoteHostPlatform } from './ssh-remote-platform'
import { installMarkovdBundle } from '../managed-server/install/markovd-remote-install'
import { getAppEnvironment } from '../../shared/app-environment'
import type { NodeRuntimeTarget } from '../../shared/node-runtime-pin'
import { MARKOVD_STARTUP_READINESS_TIMEOUT_MS } from '../../shared/markovd-profile-preflight'
import { materializeMarkovdArtifact } from '../markovd/markovd-artifact-materializer'
import { readMarkovdBundleTarget } from './markovd-deployment-target'
import { resolveMarkovdRuntimeTarget } from '../managed-server/lifecycle/markovd-runtime-target'
import {
  markovdNodeRuntimeInstallOptions,
  type NodeRuntimeDownloadBudget
} from './markovd-node-runtime-install-options'
import {
  markovdActivationFenceExists,
  resolveMarkovdActivationReadinessTimeout,
  withMarkovdActivationLock
} from '../managed-server/activation/markovd-activation-lock'
import { activateInstalledMarkovd } from './markovd-installed-activation'
import { markovdActivationFenceRefusal } from '../managed-server/activation/markovd-activation-fence-hold'

export type MarkovdDeployOptions = {
  conn: MarkovdHostTransport
  host: RemoteHostPlatform
  remoteHome: string
  /** An already assembled bundle; otherwise materialize the packaged template for this host. */
  localMarkovdDir?: string
  /** The bundle's runtime target; read from `localMarkovdDir` or probed when absent. */
  target?: NodeRuntimeTarget
  /** Where the pinned runtime archive is cached; defaults beside the markovd artifact cache. */
  runtimeCacheRoot?: string
  nodePath: string
  userDataDir: string
  bindHost: string
  port: number
  /** Caller supplies a protocol-aware census; unanswered host evidence must never become zero live terminals. */
  census: MarkovdTerminalCensus
  /** Bind census to its incumbent record; a changed locked record makes earlier counts unverifiable. */
  censusRecord?: MarkovdActivationRecord
  /** WSL only: the record and fence this connect read moments ago; skips the same pre-upload reads. */
  preRead?: { record: MarkovdActivationRecord; fenceOpen: boolean }
  /** WSL only: a same-version deploy skips its fence; the caller's wake re-checks under its own. */
  sameVersionFencedByCaller?: boolean
  /** Recount under fence just before stopping the same incumbent; uploads may outdate initial counts and failures stay unverifiable. */
  recountCensus: () => Promise<MarkovdTerminalCensus>
  /** Best-effort reopen when incumbent keeps serving; admission also expires server-side. */
  releaseIncumbentAdmission: () => Promise<void>
  force?: MarkovdUpdateForce
  /** The Markov app version activating, recorded so an older client never downgrades the host. */
  appVersion?: string
  /** Reapply version policy under lock because peer activation/stop may land during upload. */
  admitRecord?: (record: MarkovdActivationRecord, candidateVersion: string) => string | null
  readinessTimeoutMs?: number
  /** WSL only; SSH hosts always re-hash the runtime (see `installMarkovdBundle`). */
  recordedNodeRuntimeProbe?: boolean
  /** WSL only: bounded Node runtime downloads; SSH keeps the default timing. */
  nodeRuntimeDownload?: NodeRuntimeDownloadBudget
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
}

export type MarkovdDeployResult =
  | { outcome: 'installed-and-activated'; fullVersion: string; verdict: MarkovdActivationVerdict }
  | { outcome: 'already-active'; fullVersion: string }
  | {
      outcome: 'installed-not-activated'
      fullVersion: string
      code: string
      reason: string
      /** The candidate's own preflight or launch check failed; a deferral never sets this. */
      startCheckFailed?: true
      /** This deploy uploaded the slot rather than finding it already installed. */
      freshlyInstalled?: true
    }

export async function deployMarkovd(
  input: MarkovdDeployOptions,
  retryClearedFence = true
): Promise<MarkovdDeployResult> {
  const target =
    input.target ??
    (input.localMarkovdDir
      ? readMarkovdBundleTarget(input.localMarkovdDir)
      : await resolveMarkovdRuntimeTarget(input))
  const runtimeCacheRoot =
    input.runtimeCacheRoot ?? join(getAppEnvironment().getPath('userData'), 'markovd-artifacts')
  const options = {
    ...input,
    target,
    readinessTimeoutMs: resolveMarkovdActivationReadinessTimeout(
      input.readinessTimeoutMs,
      MARKOVD_STARTUP_READINESS_TIMEOUT_MS
    ),
    ...markovdNodeRuntimeInstallOptions(target, runtimeCacheRoot, input),
    localMarkovdDir:
      input.localMarkovdDir ?? (await materializeMarkovdArtifact(target, { signal: input.signal }))
  }
  const fullVersion = readLocalFullVersion(options.localMarkovdDir)
  const remoteDir = computeRemoteInstallDir(MARKOVD_INSTALL_MODEL, options.remoteHome, fullVersion)
  const held = async (): Promise<MarkovdDeployResult> => {
    const { cleared, ...refusal } = await markovdActivationFenceRefusal(options, 'update')
    // Retry one cleared abandoned fence; repeated abandonment must surface to the caller.
    if (cleared && retryClearedFence) {
      return deployMarkovd(
        {
          ...input,
          preRead: undefined,
          sameVersionFencedByCaller: undefined,
          target,
          localMarkovdDir: options.localMarkovdDir
        },
        false
      )
    }
    return { outcome: 'installed-not-activated', fullVersion, ...refusal }
  }
  // Refuse before upload, then re-read both admission inputs under fence.
  const preUploadRecord = options.preRead?.record ?? (await readMarkovdActivationRecord(options))
  const censusRecord = options.censusRecord ?? preUploadRecord
  // An unanswered probe only skips this shortcut; lock acquisition still arbitrates.
  if (
    !options.preRead?.fenceOpen &&
    (await markovdActivationFenceExists(options).catch(() => false))
  ) {
    return held()
  }

  const installed = await installMarkovdBundle(options, fullVersion, remoteDir)
  if (options.sameVersionFencedByCaller && preUploadRecord.active === fullVersion) {
    return { outcome: 'already-active', fullVersion }
  }

  const result = await logMarkovdActivationOutcome(
    `update to ${fullVersion}`,
    () =>
      withMarkovdActivationLock(
        options,
        (lock) =>
          activateInstalledMarkovd({ ...options, censusRecord }, fullVersion, remoteDir, lock),
        held
      ),
    ['installed-and-activated', 'already-active']
  )
  return installed === 'uploaded' && result.outcome === 'installed-not-activated'
    ? { ...result, freshlyInstalled: true }
    : result
}
