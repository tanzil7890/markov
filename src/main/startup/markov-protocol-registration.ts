import type { App } from 'electron'

/**
 * Registers `markov://` with Windows, which NSIS installs leave unregistered; macOS reads it from
 * Info.plist and Linux packages from the desktop entry. Only packaged desktop launches register,
 * so dev, test and serve runs never take over the machine's handler.
 */
export function registerMarkovProtocolClient(
  app: Pick<App, 'isPackaged' | 'isDefaultProtocolClient' | 'setAsDefaultProtocolClient'>,
  options: { platform: NodeJS.Platform; desktopLaunch: boolean }
): boolean {
  if (options.platform !== 'win32' || !app.isPackaged || !options.desktopLaunch) {
    return false
  }
  if (app.isDefaultProtocolClient('markov')) {
    return false
  }
  try {
    return app.setAsDefaultProtocolClient('markov')
  } catch (error) {
    console.warn('[protocol] Failed to register markov:// links:', error)
    return false
  }
}
