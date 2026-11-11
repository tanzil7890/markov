// Execute generated commands in /bin/sh to catch quoting and shell-semantic errors.
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  exportProfileStateJson,
  importProfileStateJson
} from '../../persistence/profile-state/profile-state-documents'
import { openProfileStateDatabase } from '../../persistence/profile-state/profile-state-database'
import { markovdLivenessProbeCommand, parseMarkovdLiveness } from './markovd-remote-launch'
import { MARKOVD_PID_FILENAME } from './markovd-remote-host-support'
import { parseMarkovdStopOutcome, stopMarkovdCommand } from './markovd-remote-process-control'
import {
  captureMarkovdStateSnapshotCommand,
  compareMarkovdStateSnapshotCommand,
  markovdSnapshotIsUnchanged,
  parseMarkovdSnapshotCapture,
  parseMarkovdSnapshotRestore,
  restoreMarkovdStateSnapshotCommand
} from '../host-state/markovd-state-snapshot'
import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'

const host = getRemoteHostPlatform('linux-x64')
let root = ''
let dataDir = ''
let snapshotDir = ''
const baseDir = (): string => join(root, '.markov-remote')
let versionDir = ''
const launchedPids = new Set<number>()

function sh(command: string): string {
  return execFileSync('/bin/sh', ['-c', command], { encoding: 'utf8' })
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'markovd-shell-'))
  dataDir = join(root, '.markov')
  snapshotDir = join(root, 'snapshots', 'pre-0.2.0+bb01-1000')
  versionDir = join(root, '.markov-remote', 'markovd-0.2.0+bb01')
  mkdirSync(join(dataDir, 'profiles', 'p1'), { recursive: true })
  mkdirSync(join(dataDir, 'daemon'), { recursive: true })
  mkdirSync(versionDir, { recursive: true })
  writeFileSync(join(dataDir, 'markov-profile-index.json'), '{"v":"before"}')
  writeFileSync(join(dataDir, 'profiles', 'p1', 'markov-data.json'), '{"repos":"before"}')
  writeFileSync(join(dataDir, 'daemon', 'daemon.sock.token'), 'live-daemon-token')
})

afterEach(() => {
  for (const pid of launchedPids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
  launchedPids.clear()
  rmSync(root, { recursive: true, force: true })
})

describe('state snapshot commands, run for real', () => {
  it('requires an intact comparison snapshot before an older build can restart', () => {
    expect(
      markovdSnapshotIsUnchanged(
        sh(compareMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe(false)
    sh(captureMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
    writeFileSync(join(snapshotDir, 'state.tar'), 'not an archive')
    expect(
      markovdSnapshotIsUnchanged(
        sh(compareMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe(false)
    expect(readFileSync(join(dataDir, 'profiles', 'p1', 'markov-data.json'), 'utf8')).toBe(
      '{"repos":"before"}'
    )
  })

  it('rejects symlinked profile state that a tar snapshot does not preserve', () => {
    const external = join(root, 'external-profile')
    mkdirSync(external)
    writeFileSync(join(external, 'markov-data.json'), '{"before":true}')
    const profile = join(dataDir, 'profiles', 'linked')
    symlinkSync(external, profile)

    expect(
      parseMarkovdSnapshotCapture(
        sh(captureMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe('failed')

    mkdirSync(snapshotDir, { recursive: true })
    execFileSync('tar', ['-C', dataDir, '-cf', join(snapshotDir, 'state.tar'), 'profiles'])
    writeFileSync(join(external, 'markov-data.json'), '{"candidate":true}')
    expect(
      markovdSnapshotIsUnchanged(
        sh(compareMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe(false)
    expect(readFileSync(join(external, 'markov-data.json'), 'utf8')).toBe('{"candidate":true}')
  })

  it('round-trips a quiescent SQLite profile database with its WAL sidecars', () => {
    const profileDirectory = join(dataDir, 'profiles', 'p1')
    const databasePath = join(profileDirectory, 'profile-state.db')
    const opened = openProfileStateDatabase(databasePath, 'p1')
    try {
      importProfileStateJson(
        opened.db,
        JSON.stringify({ settings: { theme: 'dark' }, snapshotMarker: 'before' })
      )
      // Keep the connection open so quiescent WAL/SHM files remain inside the archive boundary.
      expect(existsSync(`${databasePath}-wal`)).toBe(true)
      expect(
        parseMarkovdSnapshotCapture(
          sh(captureMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
        )
      ).toBe('captured')
    } finally {
      opened.db.close()
    }

    const changed = openProfileStateDatabase(databasePath, 'p1')
    try {
      importProfileStateJson(
        changed.db,
        JSON.stringify({ settings: { theme: 'light' }, snapshotMarker: 'after' })
      )
    } finally {
      changed.db.close()
    }
    expect(
      parseMarkovdSnapshotRestore(
        sh(restoreMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
      )
    ).toBe('restored')

    const restored = openProfileStateDatabase(databasePath, 'p1')
    try {
      expect(JSON.parse(exportProfileStateJson(restored.db))).toEqual({
        settings: { theme: 'dark' },
        snapshotMarker: 'before'
      })
    } finally {
      restored.db.close()
    }
  })

  it('leaves the live daemon runtime dir untouched through capture and restore', () => {
    sh(captureMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
    // Daemon tokens can change during rollback; restoring them would break terminal adoption.
    writeFileSync(join(dataDir, 'daemon', 'daemon.sock.token'), 'token-after-restart')
    sh(restoreMarkovdStateSnapshotCommand(host, dataDir, snapshotDir, baseDir()))
    expect(readFileSync(join(dataDir, 'daemon', 'daemon.sock.token'), 'utf8')).toBe(
      'token-after-restart'
    )
  })

  it('survives a data root whose path contains a quote and a space', () => {
    const nasty = join(root, `it's a dir`)
    mkdirSync(join(nasty, 'profiles'), { recursive: true })
    writeFileSync(join(nasty, 'markov-profile-index.json'), '{"v":"quoted"}')
    expect(
      parseMarkovdSnapshotCapture(
        sh(captureMarkovdStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe('captured')
    expect(
      markovdSnapshotIsUnchanged(
        sh(compareMarkovdStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe(true)
    writeFileSync(join(nasty, 'markov-profile-index.json'), '{"v":"changed"}')
    expect(
      markovdSnapshotIsUnchanged(
        sh(compareMarkovdStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe(false)
    expect(
      parseMarkovdSnapshotRestore(
        sh(restoreMarkovdStateSnapshotCommand(host, nasty, snapshotDir, baseDir()))
      )
    ).toBe('restored')
    expect(readFileSync(join(nasty, 'markov-profile-index.json'), 'utf8')).toBe('{"v":"quoted"}')
  })
})

describe('liveness and stop commands, run for real', () => {
  it('reports a reused PID running something other than this slot as DEAD', () => {
    const stranger = spawn('/bin/sh', ['-c', 'sleep 30'], { stdio: 'ignore' })
    try {
      writeFileSync(join(versionDir, MARKOVD_PID_FILENAME), String(stranger.pid))
      expect(parseMarkovdLiveness(sh(markovdLivenessProbeCommand(host, versionDir)))).toBe('DEAD')
    } finally {
      stranger.kill('SIGKILL')
    }
  })

  // Slim Linux images ship no ps; after a reboot the recorded PID often names a new process (#34149).
  it.runIf(process.platform === 'linux')(
    'reads argv from /proc on a host without ps, so a reused PID is DEAD and the slot is LIVE',
    () => {
      const noPs = 'ps() { return 127; };'
      const stranger = spawn('/bin/sh', ['-c', 'sleep 30'], { stdio: 'ignore' })
      const slot = spawn(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 30000)', join(versionDir, 'markovd.js')],
        { stdio: 'ignore' }
      )
      try {
        writeFileSync(join(versionDir, MARKOVD_PID_FILENAME), String(stranger.pid))
        expect(
          parseMarkovdLiveness(sh(`${noPs} ${markovdLivenessProbeCommand(host, versionDir)}`))
        ).toBe('DEAD')
        writeFileSync(join(versionDir, MARKOVD_PID_FILENAME), String(slot.pid))
        expect(
          parseMarkovdLiveness(sh(`${noPs} ${markovdLivenessProbeCommand(host, versionDir)}`))
        ).toBe('LIVE')
      } finally {
        stranger.kill('SIGKILL')
        slot.kill('SIGKILL')
      }
    }
  )

  it.each(['markovd.js', 'markovd-server.js'])(
    'reports LIVE and stops a running %s even without entry files',
    async (entry) => {
      const child = spawn(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 30000)', join(versionDir, entry)],
        { stdio: 'ignore' }
      )
      try {
        writeFileSync(join(versionDir, MARKOVD_PID_FILENAME), String(child.pid))
        expect(parseMarkovdLiveness(sh(markovdLivenessProbeCommand(host, versionDir)))).toBe('LIVE')

        const exited = new Promise<NodeJS.Signals | null>((resolve) =>
          child.once('exit', (_code, signal) => resolve(signal))
        )
        expect(
          parseMarkovdStopOutcome(
            sh(stopMarkovdCommand(host, versionDir, { waitSeconds: 10, justLaunched: true }))
          )
        ).toBe('stopped')
        expect(await exited).toBe('SIGTERM')
        expect(parseMarkovdLiveness(sh(markovdLivenessProbeCommand(host, versionDir)))).toBe('DEAD')
      } finally {
        child.kill('SIGKILL')
      }
    }
  )

  // kill -0 alone would keep exited zombies live, blocking stop completion and GC.
})
