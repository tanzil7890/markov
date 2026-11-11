/**
 * Lets a WSL distro stop once its markovd idle-stops with nothing left to keep (R40). The desktop's
 * holder keeps the distro up; it reads this request and ends after markovd's pid exits.
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { MARKOVD_WSL_HOLDER_RELEASE_FILENAME } from '../../shared/markovd-idle-exit'
import { writeSecureFile } from '../../shared/secure-file'
import { MARKOVD_WSL_HOST_ENV } from '../ipc/wsl-guest-windows-drive-path'
import type { MarkovdDaemonRetirement } from './markovd-daemon-retirement'

export function markovdWslHolderReleasePath(userDataPath: string): string {
  return join(userDataPath, MARKOVD_WSL_HOLDER_RELEASE_FILENAME)
}

/**
 * Only a WSL-host launch has a holder, and only a daemon that proved itself empty and left shows
 * no terminal would die with the distro. Why the launch marker: a setsid'd markovd may lack WSL_DISTRO_NAME.
 */
export function idleStopMayReleaseWslHolder(
  env: NodeJS.ProcessEnv,
  daemon: MarkovdDaemonRetirement
): boolean {
  return env[MARKOVD_WSL_HOST_ENV] === '1' && daemon.retirement === 'retired'
}

export function requestMarkovdWslHolderRelease(userDataPath: string, pid = process.pid): void {
  writeSecureFile(markovdWslHolderReleasePath(userDataPath), `${pid}\n`)
}

/**
 * A starting markovd may be given work, so any earlier request no longer stands. WSL-host launches
 * only; never throws, so a locked or unwritable data root cannot fail a start or a stop.
 */
export function withdrawMarkovdWslHolderRelease(
  userDataPath: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (env[MARKOVD_WSL_HOST_ENV] !== '1') {
    return
  }
  try {
    rmSync(markovdWslHolderReleasePath(userDataPath), { force: true })
  } catch (error) {
    console.error('[markovd] could not withdraw the WSL holder release request:', error)
  }
}
