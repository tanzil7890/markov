/** A slot this connect uploaded whose candidate then failed its start check is deleted, so the next connect re-uploads it instead of relaunching the same broken bytes. */
import { readMarkovdActivationRecord } from '../../managed-server/activation/markovd-activation-record-store'
import { markovdGcPinnedDirNames } from '../../managed-server/activation/markovd-activation-record'
import {
  probeMarkovdSlotReadiness,
  provenLiveDaemonVersion
} from '../../managed-server/lifecycle/markovd-managed-version-gc'
import { withMarkovdActivationLock } from '../../managed-server/activation/markovd-activation-lock'
import { removeRemoteInstallVersionDir } from '../../managed-server/install/remote-install-gc'
import {
  MARKOVD_INSTALL_MODEL,
  remoteInstallDirName
} from '../../managed-server/install/remote-install-model'
import { readMarkovdGcTransactionPins } from '../../ssh/markovd-gc-transaction-pins'
import { markovdSlotDir, type MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import type { MarkovdDeployResult } from '../../ssh/markovd-remote-deploy'
import { isWslMarkovdSlotInUse } from './wsl-markovd-slot-process-probe'

export async function removeFailedFreshWslMarkovdInstall(
  slot: MarkovdSlotOptions,
  deployed: MarkovdDeployResult
): Promise<void> {
  if (
    deployed.outcome !== 'installed-not-activated' ||
    !deployed.startCheckFailed ||
    !deployed.freshlyInstalled
  ) {
    return
  }
  const version = deployed.fullVersion
  try {
    // Under the activation fence, so no activator can preflight or launch this slot meanwhile.
    const outcome = await withMarkovdActivationLock(
      slot,
      async () => {
        if (!(await mayRemove(slot, version))) {
          return 'pinned'
        }
        const removed = await removeRemoteInstallVersionDir(
          slot.conn,
          MARKOVD_INSTALL_MODEL,
          markovdSlotDir(slot, version),
          slot.host,
          { isDirLive: (dir) => isWslMarkovdSlotInUse(slot, dir) }
        )
        return removed ? 'removed' : 'in-use'
      },
      () => 'fenced'
    )
    console.warn(
      outcome === 'removed'
        ? `[wsl-markovd] Removed markovd ${version}, which failed its start check after install.`
        : `[wsl-markovd] Kept failed markovd ${version} (${outcome}): it may still be in use.`
    )
  } catch (error) {
    // The connect already failed; a cleanup error must not replace its reason.
    console.warn(`[wsl-markovd] Could not remove failed markovd ${version}:`, error)
  }
}

/** The GC's pins: active, rollback target, the active daemon's build and any journaled slot. */
async function mayRemove(slot: MarkovdSlotOptions, version: string): Promise<boolean> {
  const dirName = remoteInstallDirName(MARKOVD_INSTALL_MODEL, version)
  const record = await readMarkovdActivationRecord(slot)
  // Nothing active serves terminals; a daemon the rejected candidate left here is caught by the process probe.
  const liveDaemonVersion = record.active
    ? provenLiveDaemonVersion(await probeMarkovdSlotReadiness(slot, record.active))
    : null
  if (liveDaemonVersion === undefined) {
    return false
  }
  if (markovdGcPinnedDirNames(record, liveDaemonVersion).includes(dirName)) {
    return false
  }
  const transaction = await readMarkovdGcTransactionPins(slot, { callerHoldsFence: true })
  return transaction.state === 'pinned' && !transaction.dirNames.includes(dirName)
}
