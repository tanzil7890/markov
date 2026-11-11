// Change only template build identity to model an app update bundling a newer markovd.
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  MARKOVD_TEMPLATE_MANIFEST_FILENAME,
  MARKOVD_VERSION
} from '../../../src/shared/markovd-artifacts'

const ENTRY = 'markovd.js'

/** Rewrites `templateDir` in place; its manifest keeps verifying. */
export function makeMarkovdTemplateVariant(templateDir: string, tag: string): void {
  const entry = path.join(templateDir, ENTRY)
  appendFileSync(entry, `\n// markovd e2e template variant ${tag}\n`)
  const manifestPath = path.join(templateDir, MARKOVD_TEMPLATE_MANIFEST_FILENAME)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.commonSha256[ENTRY] = createHash('sha256').update(readFileSync(entry)).digest('hex')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** The host's activation record, read the way a client reads it. */
export function readHostMarkovdActivation(exec: (command: string) => string): {
  active?: string
  previous?: string
  activeAppVersion?: string
} {
  return JSON.parse(exec('cat "$HOME/.markov-remote/markovd-active.json"'))
}

export function isMarkovdFullVersion(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${MARKOVD_VERSION}+`)
}
