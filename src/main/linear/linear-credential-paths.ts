import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const LEGACY_WORKSPACE_ID = 'legacy'

function getMarkovDir(): string {
  return join(homedir(), '.markov')
}

function getLegacyTokenPath(): string {
  return join(getMarkovDir(), 'linear-token.enc')
}

export function getLegacyViewerPath(): string {
  return join(getMarkovDir(), 'linear-viewer.json')
}

export function getWorkspaceFilePath(): string {
  return join(getMarkovDir(), 'linear-workspaces.json')
}

export function getWorkspaceTokenDir(): string {
  return join(getMarkovDir(), 'linear-tokens')
}

export function getWorkspaceTokenPath(workspaceId: string): string {
  if (workspaceId === LEGACY_WORKSPACE_ID) {
    return getLegacyTokenPath()
  }
  return join(getWorkspaceTokenDir(), `${Buffer.from(workspaceId).toString('base64url')}.enc`)
}

export function ensureMarkovDir(): void {
  const dir = getMarkovDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function ensureWorkspaceTokenDir(): void {
  const dir = getWorkspaceTokenDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}
