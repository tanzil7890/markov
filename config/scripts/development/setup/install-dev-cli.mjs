#!/usr/bin/env node
// Symlink markov-dev into /usr/local/bin after build:cli for global dev access.
import { existsSync, lstatSync, readlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const scriptDir = import.meta.dirname
const source = path.join(scriptDir, '../launch/markov-dev.mjs')

const commandPath =
  process.platform === 'darwin' || process.platform === 'linux' ? '/usr/local/bin/markov-dev' : null

if (!commandPath) {
  console.log('[markov-dev] Skipping global symlink (unsupported platform).')
  process.exit(0)
}

function isOwnedByUs(target) {
  try {
    if (!lstatSync(target).isSymbolicLink()) {
      return false
    }
    return readlinkSync(target) === source
  } catch {
    return false
  }
}

if (existsSync(commandPath)) {
  if (isOwnedByUs(commandPath)) {
    console.log(`[markov-dev] ${commandPath} already points to dev CLI.`)
    process.exit(0)
  }
  console.error(
    `[markov-dev] ${commandPath} exists but is not our symlink. Remove it manually if you want the dev CLI installed globally.`
  )
  process.exit(0)
}

try {
  execFileSync('ln', ['-s', source, commandPath], { stdio: 'inherit' })
  console.log(`[markov-dev] Symlinked ${commandPath} → ${source}`)
} catch {
  console.log(
    `[markov-dev] Could not create ${commandPath} (permission denied). Run once with:\n` +
      `  sudo ln -s ${source} ${commandPath}`
  )
}
