import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runProcess } from '@markov/process-host'
import {
  MARKOVD_LAUNCHER_FILENAME,
  MARKOVD_SERVER_ENTRY_FILENAME
} from '../../shared/markovd-artifacts'
import { NODE_RUNTIME_PIN } from '../../shared/node-runtime-pin'
import { hashMarkovdLauncher } from '../../shared/markovd-build-identity'
import {
  locatePinnedNodeForTests,
  skipForMissingInputs,
  writeNodeSlotFixture
} from './markovd-node-slot-fixture'

const pinnedNode = locatePinnedNodeForTests()
const launcherNode =
  process.env.MARKOV_TEST_LAUNCHER_NODE_EXECUTABLE ??
  process.env.MARKOV_TEST_NODE_EXECUTABLE ??
  process.execPath
let root = ''
let launcher = ''
const SERVER_FIXTURE = [
  'using resource = { [Symbol.dispose]() {} };',
  'console.log(JSON.stringify({ node: process.versions.node, args: process.argv.slice(2) }));'
].join('\n')

async function buildLauncher(entry: string): Promise<string[]> {
  const builder = pathToFileURL(
    join(process.cwd(), 'config/scripts/markovd-distribution/server-bundle/markovd-entry-build.mjs')
  ).href
  const result = await runProcess({
    program: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      `import {buildMarkovdLauncher} from ${JSON.stringify(builder)};` +
        `const result=await buildMarkovdLauncher(${JSON.stringify(entry)});` +
        'console.log(JSON.stringify(Object.keys(result.metafile.inputs)))'
    ],
    env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1' }
  })
  expect(result.code, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'markov-launcher-isolation-'))
  launcher = join(root, MARKOVD_LAUNCHER_FILENAME)
  await writeFile(join(root, MARKOVD_SERVER_ENTRY_FILENAME), SERVER_FIXTURE)
  await buildLauncher(launcher)
})

it('changes the launcher identity when the server is rebuilt', async () => {
  const directory = join(root, 'rebuilt')
  await mkdir(directory)
  const entry = join(directory, MARKOVD_LAUNCHER_FILENAME)
  const server = join(directory, MARKOVD_SERVER_ENTRY_FILENAME)
  await writeFile(server, SERVER_FIXTURE)
  await buildLauncher(entry)
  const first = hashMarkovdLauncher(entry)
  await writeFile(server, 'console.log("rebuilt server")')
  await buildLauncher(entry)
  expect(hashMarkovdLauncher(entry)).not.toBe(first)
})

afterAll(async () => {
  // Windows can hold an exited node.exe image open briefly (EBUSY).
  await rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 })
})

it('runs an unpackaged server on the supported host runtime and preserves arguments', async () => {
  const directory = join(root, 'unpackaged')
  await mkdir(directory)
  const entry = join(directory, MARKOVD_LAUNCHER_FILENAME)
  await writeFile(
    join(directory, MARKOVD_SERVER_ENTRY_FILENAME),
    'console.log(JSON.stringify({ node: process.versions.node, args: process.argv.slice(2) }))'
  )
  await buildLauncher(entry)
  const version = await runProcess({
    program: process.execPath,
    args: ['-p', 'process.versions.node']
  })
  const args = ['a path with spaces', '--port', '0']
  const result = await runProcess({
    program: process.execPath,
    args: [entry, ...args],
    env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1' }
  })
  expect(result.code, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({ node: version.stdout.trim(), args })
})

it('refuses an old host runtime without a bundle before parsing the server', async ({ skip }) => {
  const version = await runProcess({
    program: launcherNode,
    args: ['-p', 'process.versions.node']
  })
  if (Number(version.stdout.trim().split('.')[0]) >= 24) {
    skip()
  }
  const result = await runProcess({
    program: launcherNode,
    args: [launcher],
    env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1' }
  })
  expect(result.code).toBe(78)
  expect(result.stderr).toContain('requires Node.js 24')
  expect(result.stderr).not.toContain('SyntaxError')
  expect(result.stdout).toBe('')
})

it('preserves the crash exit code when the server fails while loading', async () => {
  const directory = join(root, 'server-crash')
  await mkdir(directory)
  const entry = join(directory, MARKOVD_LAUNCHER_FILENAME)
  await writeFile(
    join(directory, MARKOVD_SERVER_ENTRY_FILENAME),
    'throw new Error("server evaluation failed")'
  )
  await buildLauncher(entry)
  const result = await runProcess({
    program: process.execPath,
    args: [entry],
    env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1' }
  })
  expect(result.code).toBe(1)
  expect(result.stderr).toContain('server evaluation failed')
  expect(result.stderr).not.toContain('markovd: failed to launch:')
})

const skip = skipForMissingInputs('artifact', pinnedNode ? [] : ['the pinned Node runtime'])

describe.skipIf(skip)('split launcher with the real bundled runtime', () => {
  it('hands off before parsing Node 24 server syntax and preserves arguments', async () => {
    if (!pinnedNode) {
      throw new Error('Missing pinned runtime')
    }
    const { slotDir } = await writeNodeSlotFixture(join(root, 'handoff'), pinnedNode)
    await writeFile(join(slotDir, MARKOVD_LAUNCHER_FILENAME), await readFile(launcher))
    const server = join(slotDir, MARKOVD_SERVER_ENTRY_FILENAME)
    await writeFile(server, SERVER_FIXTURE)
    const args = ['a path with spaces', 'line one\nline two', '--port', '0']
    const result = await runProcess({
      program: launcherNode,
      args: [join(slotDir, MARKOVD_LAUNCHER_FILENAME), ...args],
      env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1' }
    })
    expect(result.code, result.stderr.slice(0, 2000)).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ node: NODE_RUNTIME_PIN.version, args })
  })

  it('refuses changed server bytes before loading them', async () => {
    if (!pinnedNode) {
      throw new Error('Missing pinned runtime')
    }
    const { slotDir, runtime } = await writeNodeSlotFixture(join(root, 'tampered'), pinnedNode)
    await writeFile(join(slotDir, MARKOVD_LAUNCHER_FILENAME), await readFile(launcher))
    await writeFile(
      join(slotDir, MARKOVD_SERVER_ENTRY_FILENAME),
      'throw new Error("server was loaded")'
    )
    const result = await runProcess({
      program: runtime,
      args: [join(slotDir, MARKOVD_LAUNCHER_FILENAME)],
      env: { ...process.env, MARKOV_BACKGROUND_LAUNCH: '1' }
    })
    expect(result.code).toBe(78)
    expect(result.stderr).toContain('server does not match its launcher')
    expect(result.stderr).not.toContain('server was loaded')
  })
})
