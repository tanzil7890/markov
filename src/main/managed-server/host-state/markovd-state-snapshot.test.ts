import { describe, expect, it } from 'vitest'

import {
  parseMarkovdSnapshotCapture,
  parseMarkovdSnapshotPresence,
  parseMarkovdSnapshotRestore,
  restoreMarkovdStateSnapshotCommand
} from './markovd-state-snapshot'

import { getRemoteHostPlatform } from '../../ssh/ssh-remote-platform'

const posix = getRemoteHostPlatform('linux-x64')

const ROOT = '/home/u/.markov'
const SNAP = '/home/u/.markov-remote/markovd-state-snapshots/pre-0.2.0+bb01-1000'
const BASE = '/home/u/.markov-remote'

describe('capturing the pre-activation snapshot', () => {
  it.each([
    ['CAPTURED', 'captured'],
    ['EMPTY', 'empty'],
    ['tar: broken', 'failed'],
    ['', 'failed'],
    // Gateways may append shell job notices after a valid verdict (#30491).
    ['CAPTURED\r\nsh: line 1:  2468 Terminated   ( while sleep 60 ... )\n', 'captured'],
    ['FAILED\nCAPTURED-looking noise', 'failed']
  ])('parses %j as %s', (output, expected) => {
    expect(parseMarkovdSnapshotCapture(output)).toBe(expected)
  })
})

describe('restoring the snapshot', () => {
  it('reports a missing archive instead of extracting nothing and claiming success', () => {
    expect(restoreMarkovdStateSnapshotCommand(posix, ROOT, SNAP, BASE)).toContain('echo MISSING')
    expect(parseMarkovdSnapshotRestore('MISSING')).toBe('missing')
    expect(parseMarkovdSnapshotRestore('RESTORED')).toBe('restored')
    expect(parseMarkovdSnapshotRestore('FAILED')).toBe('failed')
    expect(parseMarkovdSnapshotRestore('RESTORED\nsh: line 1: 13 Terminated')).toBe('restored')
  })

  it.each([
    ['PRESENT', 'present'],
    ['ABSENT', 'absent'],
    ['', 'unverifiable'],
    ['bash: tar: command not found', 'unverifiable']
  ])('reads snapshot presence %j as %s, never treating silence as absence', (out, expected) => {
    expect(parseMarkovdSnapshotPresence(out)).toBe(expected)
  })
})
