import type { NodeRuntimeTarget } from '../../../shared/node-runtime-pin'
import type { ServeReadiness } from '../../server/serve-readiness'
import { readMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import {
  markovdSlotDir,
  resolveMarkovdSlotIdentity,
  type MarkovdSlotOptions
} from '../../ssh/markovd-recovery-slot'
import { probeActiveMarkovdReadiness } from '../../ssh/markovd-active-readiness'
import { gcOldMarkovdVersions } from '../install/markovd-remote-gc'
import { nodeRuntimeStorePins } from '../../ssh/pinned-runtime-host-target'

/** null proves no daemon; undefined means its version is unknown. */
export function provenLiveDaemonVersion(readiness: ServeReadiness): string | null | undefined {
  const daemon = readiness.health?.terminalDaemon
  if (daemon?.state === 'live' && daemon.buildVersion) {
    return daemon.buildVersion
  }
  return daemon?.state === 'absent' ? null : undefined
}

export type ManagedMarkovdPruneArgs = {
  slot: MarkovdSlotOptions
  serverTarget: NodeRuntimeTarget
  activeVersion: string
  readiness: ServeReadiness
  keepStagedWithinDays?: number
}

/** True only when GC ran and left no stale version dir behind. */
export async function pruneManagedMarkovdVersions(args: ManagedMarkovdPruneArgs): Promise<boolean> {
  const liveDaemonVersion = provenLiveDaemonVersion(args.readiness)
  // Unknown daemon versions could still execute from any candidate tree; skip GC.
  if (liveDaemonVersion === undefined) {
    return false
  }
  try {
    return await gcOldMarkovdVersions({
      conn: args.slot.conn,
      host: args.slot.host,
      remoteHome: args.slot.remoteHome,
      currentDirAbsPath: markovdSlotDir(args.slot, args.activeVersion),
      record: await readMarkovdActivationRecord(args.slot),
      liveDaemonVersion,
      // Default and compat builds share one runtime store.
      nodeRuntimePins: nodeRuntimeStorePins(args.serverTarget),
      ...(args.keepStagedWithinDays !== undefined
        ? { keepStagedWithinDays: args.keepStagedWithinDays }
        : {}),
      signal: args.slot.signal
    })
  } catch (error) {
    // Cleanup must not fail completed deploys; later connects retry.
    console.warn('[markovd-gc] Pruning old markovd versions failed:', error)
    return false
  }
}

/** GC otherwise runs only after an activation, so each deferred release left its staged slot behind (#34149). */
export async function pruneSupersededMarkovdCandidates(
  slot: MarkovdSlotOptions,
  serverTarget: NodeRuntimeTarget,
  candidateVersion: string
): Promise<void> {
  let readiness: ServeReadiness
  try {
    const active = (await readMarkovdActivationRecord(slot)).active
    if (!active) {
      return
    }
    readiness = await probeMarkovdSlotReadiness(slot, active)
  } catch (error) {
    // Without the incumbent's daemon version a staged tree may still be executing.
    console.warn('[markovd-gc] Skipped pruning staged markovd versions:', error)
    return
  }
  await pruneManagedMarkovdVersions({
    slot,
    serverTarget,
    activeVersion: candidateVersion,
    readiness,
    keepStagedWithinDays: STAGED_BUILD_KEEP_DAYS
  })
}

/** Readiness of the markovd serving `version`, which names its live terminal daemon's build. */
export async function probeMarkovdSlotReadiness(
  slot: MarkovdSlotOptions,
  version: string
): Promise<ServeReadiness> {
  const identity = await resolveMarkovdSlotIdentity(slot, version)
  return probeActiveMarkovdReadiness(
    { ...slot, remoteInstallDir: identity.remoteDir },
    { buildHash: identity.buildHash, fullVersion: identity.version }
  )
}

// Desktops on different releases share hosts; without a grace period each re-uploads what the other pruned.
const STAGED_BUILD_KEEP_DAYS = 3
