import type { SshTarget } from '../../shared/ssh-types'
import type { WslMarkovdHostTarget } from '../wsl/markovd/wsl-markovd-host-target'
import type { RemoteInstallTransport } from '../managed-server/install/remote-install-transport'
import type { MarkovdLaunchDetach } from '../managed-server/install/markovd-remote-launch'

/** Only id/label have the same meaning across host kinds. */
export type MarkovdHostTarget = SshTarget | WslMarkovdHostTarget

export function isWslMarkovdHostTarget(target: MarkovdHostTarget): target is WslMarkovdHostTarget {
  return 'kind' in target && target.kind === 'wsl'
}

export type MarkovdHostTransport = RemoteInstallTransport & {
  getTarget(): MarkovdHostTarget
  /** Absent on SSH, which detaches with nohup. */
  readonly markovdLaunchDetach?: MarkovdLaunchDetach
  /** Pass client-only host facts at launch; SSH adds none. */
  readonly markovdLaunchEnv?: (
    launch: MarkovdLaunchEnvRequest
  ) => Promise<readonly MarkovdLaunchEnvEntry[]>
}

/** The slot being launched; entries only its own build understands must check the version. */
export type MarkovdLaunchEnvRequest = { readonly fullVersion: string }

/** `keep-existing` applies the value only when the launching shell has none, so a user's own setting wins. */
export type MarkovdLaunchEnvEntry = readonly [name: string, value: string, mode?: 'keep-existing']
