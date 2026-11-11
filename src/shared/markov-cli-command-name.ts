import { getAppEnvironment, hasAppEnvironment } from './app-environment'

export function getMarkovCliCommandNameForPlatform(platform: NodeJS.Platform): string {
  if (platform === 'linux') {
    return 'markov-ide'
  }
  if (platform === 'win32') {
    return 'markov.cmd'
  }
  return 'markov'
}

/** The Linux `markov-ide` name is desktop-only: SSH relays and headless Markov servers put plain `markov` on PATH. */
export function skipsLinuxMarkovCliRename(isRemote: boolean | undefined): boolean {
  if (isRemote) {
    return true
  }
  // Only a headless server publishes its own launcher; Windows ones (WSL launches) keep the rename.
  const launcher = hasAppEnvironment() ? getAppEnvironment().getCliLauncherPath?.() : null
  return launcher?.endsWith('/markov') ?? false
}
