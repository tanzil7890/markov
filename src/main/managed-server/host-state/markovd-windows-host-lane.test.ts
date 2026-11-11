// Real Windows SSH host lane: invoke-windows-host-cells.ps1 supplies MARKOV_RUN_SSH_WINDOWS_HOST=1 and MARKOV_SSH_WINDOWS_HOST_CELL.
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest'

vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd() } }))

import { SshConnection } from '../../ssh/connection/ssh-connection'
import {
  connectHostileHost,
  installHostileHostAppEnvironment
} from '../../ssh/hostile-host-test-support/ssh-hostile-host-test-harness'
import { resolveMarkovdRemoteContext } from '../install/markovd-remote-context'
import { proveWindowsStdioBridge } from '../../ssh/markovd-windows-stdio-bridge-test-cell'
import { deployMarkovd } from '../../ssh/markovd-remote-deploy'
import { markovdLivenessProbeCommand, parseMarkovdLiveness } from '../install/markovd-remote-launch'
import { markovdSlotDir, type MarkovdSlotOptions } from '../../ssh/markovd-recovery-slot'
import { decommissionRemoteMarkovd } from '../install/markovd-remote-decommission'
import { readMarkovdActivationRecord } from '../activation/markovd-activation-record-store'
import { gcOldMarkovdVersions } from '../install/markovd-remote-gc'
import { execMarkovdRemote } from '../install/markovd-remote-runtime-control'
import { markovdWindowsNodeCommandLine } from '../install/markovd-remote-windows-node'
import { joinRemotePath } from '../../ssh/ssh-remote-platform'
import {
  isWindowsMarkovdCellId,
  readWindowsHostCellDescriptor,
  windowsHostSshTarget
} from '../../ssh/ssh-windows-host-cells'

const RUN = process.env.MARKOV_RUN_SSH_WINDOWS_HOST === '1'
const CELL_TIMEOUT_MS = 20 * 60_000

/** Host operations must avoid PowerShell hops regardless of sshd DefaultShell. */
function isMarkovdHostCommand(command: string): boolean {
  return /markovd-host-script-[0-9a-f]{16}\.js|[\\/]markovd\.js /u.test(command)
}

describe.runIf(RUN)('managed markovd on a Windows OpenSSH host', () => {
  let cleanupAppEnvironment: (() => void) | null = null

  beforeAll(() => {
    cleanupAppEnvironment = installHostileHostAppEnvironment()
  })

  afterAll(() => {
    cleanupAppEnvironment?.()
  })

  it(
    'deploys, serves, decommissions by request and exits',
    async () => {
      const descriptor = readWindowsHostCellDescriptor(
        process.env.MARKOV_SSH_WINDOWS_HOST_CELL ?? ''
      )
      if (!isWindowsMarkovdCellId(descriptor.cell)) {
        throw new Error(`${descriptor.cell} is not a managed markovd cell`)
      }
      const sshTarget = windowsHostSshTarget(descriptor, randomUUID())
      let exec: MockInstance<SshConnection['exec']> | null = null
      const receipt: Record<string, unknown> = { cell: descriptor.cell, target: descriptor.target }
      let conn: SshConnection | null = null
      try {
        conn = await connectHostileHost(sshTarget)
        exec = vi.spyOn(SshConnection.prototype, 'exec')
        const context = await resolveMarkovdRemoteContext(sshTarget, conn)
        expect(context.host.os).toBe('win32')
        const options: MarkovdSlotOptions = {
          conn,
          host: context.host,
          remoteHome: context.remoteHome,
          nodePath: 'node',
          userDataDir: context.userDataDir,
          bindHost: '127.0.0.1',
          port: 0
        }
        const idle = { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
        const deployed = await deployMarkovd({
          ...options,
          target: context.serverTarget,
          census: idle,
          recountCensus: async () => idle,
          releaseIncumbentAdmission: async () => {}
        })
        receipt.deploy = deployed
        expect(deployed.outcome).toBe('installed-and-activated')
        const slotDir = markovdSlotDir(options, deployed.fullVersion)
        const liveness = async () =>
          parseMarkovdLiveness(
            await execMarkovdRemote(options, markovdLivenessProbeCommand(options.host, slotDir))
          )
        expect(await liveness()).toBe('LIVE')
        // Probe the native markov launcher installed inside the managed profile.
        const cli = joinRemotePath(options.host, context.userDataDir, 'cli', 'bin', 'markov.exe')
        const status = JSON.parse(
          await execMarkovdRemote(options, markovdWindowsNodeCommandLine(cli, ['status', '--json']))
        )
        receipt.cliStatus = status.result
        expect(status.result.runtime).toMatchObject({ reachable: true })
        expect(status.result.app.desktopWindowStatus).toBe('blocked')
        // This account blocks forwarding; verify the managed tunnel's stdio fallback.
        receipt.stdioBridge = await proveWindowsStdioBridge(conn, options.host, slotDir)
        expect(receipt.stdioBridge).toMatchObject({
          forwarding: 'refused',
          response: expect.stringMatching(/^HTTP\/1\.1 101/u)
        })
        const record = await readMarkovdActivationRecord(options)
        receipt.decommission = await decommissionRemoteMarkovd({
          ...options,
          record,
          census: { liveSessions: 0, startedSinceActivation: 0, daemonProtocolVersion: null }
        })
        // Include the refusal detail because matcher diffs omit the message.
        expect(receipt.decommission, JSON.stringify(receipt.decommission)).toMatchObject({
          outcome: 'decommissioned',
          version: deployed.fullVersion
        })
        expect(await liveness()).toBe('DEAD')
        await gcOldMarkovdVersions({
          conn,
          host: options.host,
          remoteHome: options.remoteHome,
          currentDirAbsPath: slotDir,
          record: await readMarkovdActivationRecord(options)
        })
        expect(await liveness()).toBe('DEAD')

        const commands = exec.mock.calls.map(([command]) => String(command))
        const markovdCommands = commands.filter(isMarkovdHostCommand)
        receipt.markovdCommands = markovdCommands.length
        receipt.powershellCommands = commands.filter((command) =>
          /^powershell\.exe /iu.test(command)
        ).length
        expect(markovdCommands.length).toBeGreaterThan(0)
        for (const command of markovdCommands) {
          expect(command).not.toMatch(/EncodedCommand/u)
        }
        receipt.passed = true
      } finally {
        exec?.mockRestore()
        await conn?.disconnect().catch(() => {})
        writeFileSync(descriptor.receipt, `${JSON.stringify(receipt, null, 2)}\n`)
      }
    },
    CELL_TIMEOUT_MS
  )
})
