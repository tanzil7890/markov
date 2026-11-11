import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => tmpdir(), getAppPath: () => tmpdir() }
}))
import {
  installLinuxBareMarkovDispatcher,
  removeLinuxBareMarkovDispatcher
} from './linux-bare-markov-dispatcher'

const created: string[] = []

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function writeProgram(path: string, output: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `#!/bin/sh\necho "${output} $*"\n`, 'utf8')
  await chmod(path, 0o755)
}

/** A home with Markov's dispatcher installed, and an unrelated second `markov` on PATH. */
async function makeFixture(): Promise<{
  root: string
  homePath: string
  resourcesPath: string
  launcherPath: string
  dispatcherPath: string
  screenReaderDir: string
  toolsDir: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'markov bare dispatcher '))
  created.push(root)
  const homePath = join(root, 'home')
  const resourcesPath = join(root, 'resources')
  const launcherPath = join(resourcesPath, 'bin', 'markov-ide')
  const screenReaderDir = join(root, 'usr-bin')
  await writeProgram(launcherPath, 'MARKOV_CLI')
  await writeProgram(join(screenReaderDir, 'markov'), 'SCREEN_READER')
  // Only bash on the base PATH, so a runner's own /usr/bin/markov cannot answer.
  const toolsDir = join(root, 'tools')
  await mkdir(toolsDir)
  const bash = spawnSync('/bin/sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim()
  await symlink(bash, join(toolsDir, 'bash'))
  const result = await installLinuxBareMarkovDispatcher({
    resourcesPath,
    homePath,
    appImagePath: null
  })
  expect(result.state).toBe('installed')
  return {
    root,
    homePath,
    resourcesPath,
    launcherPath,
    dispatcherPath: result.dispatcherPath,
    screenReaderDir,
    toolsDir
  }
}

function runMarkov(
  fixture: { homePath: string; toolsDir: string },
  pathDirs: string[],
  env: Record<string, string> = {}
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('markov', ['status'], {
    encoding: 'utf8',
    env: { HOME: fixture.homePath, PATH: [...pathDirs, fixture.toolsDir].join(':'), ...env },
    timeout: 10_000
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

describe.runIf(process.platform !== 'win32')(
  'the bare markov dispatcher as a shell runs it',
  () => {
    it("leaves another `markov` on PATH to everyone but Markov's children", async () => {
      const fixture = await makeFixture()
      const binDir = join(fixture.homePath, '.local', 'bin')

      expect(runMarkov(fixture, [binDir, fixture.screenReaderDir]).stdout).toBe(
        'SCREEN_READER status\n'
      )
      expect(
        runMarkov(fixture, [binDir, fixture.screenReaderDir], { MARKOV_PANE_KEY: 'tab:1' }).stdout
      ).toBe('MARKOV_CLI status\n')
      expect(
        runMarkov(fixture, [binDir, fixture.screenReaderDir], { MARKOV_CLI_BIN_DIR: '/x' }).stdout
      ).toBe('MARKOV_CLI status\n')
    })

    async function addSecondDispatcher(fixture: { root: string; dispatcherPath: string }) {
      const otherBin = join(fixture.root, 'other-home', '.local', 'bin')
      await mkdir(otherBin, { recursive: true })
      await writeFile(join(otherBin, 'markov'), await readFile(fixture.dispatcherPath, 'utf8'), {
        mode: 0o755
      })
      return otherBin
    }

    it.each(['MARKOV_PANE_KEY', 'MARKOV_CLI_BIN_DIR', 'MARKOV_USER_DATA_PATH'])(
      'never starts the screen reader for Markov children (%s) once Markov is gone',
      async (variable) => {
        const fixture = await makeFixture()
        const otherBin = await addSecondDispatcher(fixture)
        await rm(fixture.resourcesPath, { recursive: true, force: true })

        const result = runMarkov(
          fixture,
          [otherBin, join(fixture.homePath, '.local', 'bin'), fixture.screenReaderDir],
          { [variable]: 'set' }
        )
        expect(result.status).toBe(127)
        expect(result.stdout).toBe('')
        expect(result.stderr).toContain('Markov is no longer installed')
      }
    )

    it('never loops when the only other `markov` is another dispatcher', async () => {
      const fixture = await makeFixture()
      const otherBin = await addSecondDispatcher(fixture)
      await rm(fixture.resourcesPath, { recursive: true, force: true })

      const result = runMarkov(fixture, [join(fixture.homePath, '.local', 'bin'), otherBin])
      expect(result.status).toBe(127)
      expect(result.stderr).toContain('Markov is no longer installed')
    })
  }
)

describe.runIf(process.platform !== 'win32')('removing the bare markov dispatcher', () => {
  it("removes Markov's dispatcher and keeps a user's own `markov`", async () => {
    const fixture = await makeFixture()

    await expect(removeLinuxBareMarkovDispatcher(fixture.homePath)).resolves.toBe(true)
    expect(existsSync(fixture.dispatcherPath)).toBe(false)
    await expect(removeLinuxBareMarkovDispatcher(fixture.homePath)).resolves.toBe(false)

    await writeProgram(fixture.dispatcherPath, 'MINE')
    await expect(removeLinuxBareMarkovDispatcher(fixture.homePath)).resolves.toBe(false)
    expect(await readFile(fixture.dispatcherPath, 'utf8')).toContain('MINE')
  })
})
