import { join } from 'node:path'

export const LINUX_CLI_COMMAND_NAME = 'markov-ide'

// Keep path-only callers independent of cli-installer's Electron dependency.
export function getBundledLauncherPath(
  platform: NodeJS.Platform,
  resourcesPath: string
): string | null {
  if (platform === 'darwin') {
    return join(resourcesPath, 'bin', 'markov')
  }
  if (platform === 'linux') {
    return join(resourcesPath, 'bin', LINUX_CLI_COMMAND_NAME)
  }
  if (platform === 'win32') {
    return join(resourcesPath, 'bin', 'markov.exe')
  }
  return null
}
