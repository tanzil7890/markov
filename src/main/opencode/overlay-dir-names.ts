import { createHash } from 'node:crypto'

export const OPENCODE_OVERLAY_DIR = 'opencode-config-overlays'
export const MARKOV_OPENCODE_PLUGIN_FILE = 'markov-opencode-status.js'

export function toSafeDirName(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 32)
}

export function sourceOverlayDirName(sourceConfigDir: string): string {
  return toSafeDirName(`source:${sourceConfigDir}`)
}
