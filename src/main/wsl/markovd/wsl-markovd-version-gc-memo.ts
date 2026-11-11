import {
  provenLiveDaemonVersion,
  pruneManagedMarkovdVersions,
  type ManagedMarkovdPruneArgs
} from '../../managed-server/lifecycle/markovd-managed-version-gc'

// Only activating another version or a daemon change makes a dir stale; until then a clean GC stays clean.
// A distro shared with another Markov, or a rolled-back activation, can leave a stale dir until the next launch.
const cleanHosts = new Set<string>()

/** Skips version GC on reconnects (distro restarts) after one left nothing behind under the same pins. */
export async function pruneWslMarkovdVersionsUntilClean(
  environmentId: string,
  args: ManagedMarkovdPruneArgs,
  prune: (args: ManagedMarkovdPruneArgs) => Promise<boolean> = pruneManagedMarkovdVersions
): Promise<void> {
  const key = JSON.stringify([
    environmentId,
    args.slot.remoteHome,
    args.activeVersion,
    provenLiveDaemonVersion(args.readiness) ?? null
  ])
  if (cleanHosts.has(key)) {
    return
  }
  if (await prune(args)) {
    cleanHosts.add(key)
  }
}

export function resetWslMarkovdVersionGcMemoForTests(): void {
  cleanHosts.clear()
}
