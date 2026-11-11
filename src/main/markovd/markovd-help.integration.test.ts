import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runProcess } from '@markov/process-host'
import {
  MARKOVD_LAUNCHER_FILENAME,
  MARKOVD_SERVER_ENTRY_FILENAME
} from '../../shared/markovd-artifacts'

let directory = ''
let launcher = ''

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'markovd-help-'))
  launcher = join(directory, MARKOVD_LAUNCHER_FILENAME)
  const builder = pathToFileURL(
    join(process.cwd(), 'config/scripts/markovd-distribution/server-bundle/markovd-entry-build.mjs')
  ).href
  const built = await runProcess({
    program: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      `import {buildMarkovdEntry,buildMarkovdLauncher} from ${JSON.stringify(builder)};` +
        `await buildMarkovdEntry(${JSON.stringify(join(directory, MARKOVD_SERVER_ENTRY_FILENAME))});` +
        `await buildMarkovdLauncher(${JSON.stringify(launcher)});`
    ],
    env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1' },
    timeoutMs: 60_000
  })
  expect(built.code, built.stderr).toBe(0)
})

afterAll(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('real markovd executable help', () => {
  it('leaves an existing instance lock untouched', async () => {
    const dataRoot = join(directory, 'locked-profile')
    await mkdir(dataRoot)
    const lock = join(dataRoot, 'markovd.lock')
    const content = 'an existing instance owns this profile\n'
    await writeFile(lock, content)
    const result = await runProcess({
      program: process.execPath,
      args: [launcher, '--help'],
      env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1', MARKOV_USER_DATA: dataRoot },
      timeoutMs: 10_000
    })
    expect(result.code, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    expect(await readFile(lock, 'utf8')).toBe(content)
    expect(await readdir(dataRoot)).toEqual(['markovd.lock'])
  })
})
