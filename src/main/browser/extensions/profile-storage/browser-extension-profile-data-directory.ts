import { app } from 'electron'
import { join } from 'node:path'

let markovProfileDirectory: string | null = null

/** Browser profile ids repeat across Markov profiles ("default"), so their extension data lives per Markov profile. */
export function configureBrowserExtensionProfileDataDirectory(profileDirectory: string): void {
  markovProfileDirectory = profileDirectory
}

/** Root of the per-browser-profile extension stores (sync storage, grants and state, DNR). */
export function getBrowserExtensionProfileDataDirectory(): string {
  return join(markovProfileDirectory ?? app.getPath('userData'), 'browser-extensions')
}
