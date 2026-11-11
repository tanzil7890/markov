import { describe, expect, it, vi } from 'vitest'
import { formatServeRuntimeSelection } from '../../shared/markovd-local-serve-selection'
import type { runProcess } from '@markov/process-host'
import { resolveLocalServeRuntime } from './serve-markovd-launch'
import { markovdServeArgs, serveOptionArgs } from '../../shared/markovd-serve-argv'

type RunProcess = typeof runProcess

function answering(stdout: string, code = 0): RunProcess {
  return vi.fn<RunProcess>(async () => ({
    code,
    signal: null,
    stdout,
    stderr: '',
    timedOut: false
  }))
}

const options = {
  executable: '/Applications/Markov.app/Contents/MacOS/Markov',
  appRoot: '/Applications/Markov.app/Contents/Resources/app.asar',
  userDataPath: '/Users/u/Library/Application Support/markov',
  usesMacUpdateHandoff: false
}

describe('markov serve asking the app which host to run', () => {
  it("requests the app's selection entry in Node mode and parses its answer", async () => {
    const selection = {
      kind: 'markovd' as const,
      runtime: '/rt/node',
      entry: '/slot/markovd.js',
      version: '1'
    }
    const run = answering(`noise\n${formatServeRuntimeSelection(selection)}\n`)
    expect(await resolveLocalServeRuntime(options, run)).toEqual(selection)
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        program: options.executable,
        args: [
          `${options.appRoot}/out/main/markovd/markovd-local-serve-selection-entry.js`,
          '--user-data',
          options.userDataPath,
          '--app-root',
          options.appRoot
        ],
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }),
        stdio: ['ignore', 'pipe', 'inherit']
      })
    )
  })

  it('keeps packaged macOS on Electron without starting the app to ask', async () => {
    const run = answering('')
    expect(await resolveLocalServeRuntime({ ...options, usesMacUpdateHandoff: true }, run)).toEqual(
      {
        kind: 'electron',
        reason: expect.stringContaining('packaged macOS')
      }
    )
    expect(run).not.toHaveBeenCalled()
  })

  it('selects Electron with a reason when the app gives no answer', async () => {
    expect(await resolveLocalServeRuntime(options, answering('', 1))).toEqual({
      kind: 'electron',
      reason: expect.stringContaining('did not answer')
    })
    const failing = vi.fn<RunProcess>(async () => {
      throw new Error('spawn ENOENT')
    })
    expect(await resolveLocalServeRuntime(options, failing)).toEqual({
      kind: 'electron',
      reason: expect.stringContaining('spawn ENOENT')
    })
  })

  it('renders markovd serve options with the default bind address', () => {
    expect(
      markovdServeArgs({
        json: true,
        port: '6768',
        pairingAddress: '10.0.0.5',
        noPairing: true,
        mobilePairing: true,
        recipeJson: true,
        projectRoot: '/work/app'
      })
    ).toEqual([
      '--bind',
      '0.0.0.0',
      '--json',
      '--port',
      '6768',
      '--pairing-address',
      '10.0.0.5',
      '--no-pairing',
      '--mobile-pairing',
      '--recipe-json',
      '--project-root',
      '/work/app'
    ])
    expect(markovdServeArgs({})).toEqual(['--bind', '0.0.0.0'])
  })

  it("hands markovd the app's browser client directory when the app has one", () => {
    expect(
      markovdServeArgs({ port: '6768' }, '/opt/Markov/resources/app.asar.unpacked/out/web')
    ).toEqual([
      '--bind',
      '0.0.0.0',
      '--port',
      '6768',
      '--web-client-root',
      '/opt/Markov/resources/app.asar.unpacked/out/web'
    ])
  })

  it('spells the same flags with the --serve- prefix for the Electron host', () => {
    expect(
      serveOptionArgs(
        {
          json: true,
          port: '6768',
          pairingAddress: '10.0.0.5',
          noPairing: true,
          mobilePairing: true,
          grantDesktopControl: true,
          recipeJson: true,
          projectRoot: '/work/app'
        },
        '--serve-'
      )
    ).toEqual([
      '--serve-json',
      '--serve-port',
      '6768',
      '--serve-pairing-address',
      '10.0.0.5',
      '--serve-no-pairing',
      '--serve-mobile-pairing',
      '--serve-grant-desktop-control',
      '--serve-recipe-json',
      '--serve-project-root',
      '/work/app'
    ])
    expect(serveOptionArgs({ recipeJson: true }, '--serve-')).toEqual([])
  })
})
