import { describe, expect, it } from 'vitest'
import {
  classifyWslMarkovdLiveness,
  nextWslLivenessProbe,
  type WslLivenessEvidence
} from './wsl-markovd-liveness-verdict'

const INSTANCE = 'boot-a:100'
const MARKOVD = '321:5000'

function evidence(overrides: Partial<WslLivenessEvidence> = {}): WslLivenessEvidence {
  return {
    trigger: { source: 'bridge', code: 1 },
    running: { status: 'confirmed', running: true },
    expected: { distroInstance: INSTANCE, markovd: MARKOVD },
    ...overrides
  }
}

describe('classifyWslMarkovdLiveness', () => {
  it('reads a failed running-list probe as unverifiable, never exited, whatever the exit code', () => {
    for (const code of [0, 1, null]) {
      const verdict = classifyWslMarkovdLiveness(
        evidence({ trigger: { source: 'bridge', code }, running: { status: 'unavailable' } })
      )
      expect(verdict).toEqual({ kind: 'unverifiable', reason: 'running-list-unavailable' })
    }
  })

  it('marks every terminal exited when the distro is confirmed stopped', () => {
    const verdict = classifyWslMarkovdLiveness(
      evidence({ running: { status: 'confirmed', running: false } })
    )
    expect(verdict).toEqual({ kind: 'distro-stopped', corroborated: true })
  })

  it('needs no exit code to prove a stop, but only a failed exit corroborates it', () => {
    const stopped = { status: 'confirmed', running: false } as const
    expect(
      classifyWslMarkovdLiveness(evidence({ trigger: { source: 'verify' }, running: stopped }))
    ).toEqual({ kind: 'distro-stopped', corroborated: false })
    expect(
      classifyWslMarkovdLiveness(
        evidence({ trigger: { source: 'holder', code: 0 }, running: stopped })
      )
    ).toEqual({ kind: 'distro-stopped', corroborated: false })
  })

  it('treats a running distro whose guest did not answer as unverifiable', () => {
    expect(classifyWslMarkovdLiveness(evidence({ identity: null }))).toEqual({
      kind: 'unverifiable',
      reason: 'guest-unanswered'
    })
  })

  it('proves a restart from a new boot id or pid 1 start time, without any wall clock', () => {
    const verdict = classifyWslMarkovdLiveness(
      evidence({ identity: { distroInstance: 'boot-a:900', markovd: null } })
    )
    expect(verdict).toEqual({ kind: 'distro-restarted' })
  })

  it('reads a gone or reused markovd pid in the same incarnation as markovd exited', () => {
    for (const markovd of [null, '321:7777']) {
      const verdict = classifyWslMarkovdLiveness(
        evidence({
          trigger: { source: 'bridge', code: 0 },
          identity: { distroInstance: INSTANCE, markovd }
        })
      )
      expect(verdict).toEqual({ kind: 'markovd-exited' })
    }
  })

  it('keeps markovd live when the same process still runs, even after a bridge exit', () => {
    expect(
      classifyWslMarkovdLiveness(
        evidence({
          trigger: { source: 'bridge', code: 0 },
          identity: { distroInstance: INSTANCE, markovd: MARKOVD }
        })
      )
    ).toEqual({ kind: 'live' })
  })

  it('falls back to the port when no markovd pid was known', () => {
    const base = evidence({
      expected: { distroInstance: INSTANCE, markovd: null },
      identity: { distroInstance: INSTANCE, markovd: null }
    })
    expect(classifyWslMarkovdLiveness({ ...base, markovdPort: 'ready' })).toEqual({ kind: 'live' })
    expect(classifyWslMarkovdLiveness({ ...base, markovdPort: 'refused' })).toEqual({
      kind: 'markovd-exited'
    })
    expect(classifyWslMarkovdLiveness({ ...base, markovdPort: 'unverifiable' })).toEqual({
      kind: 'unverifiable',
      reason: 'markovd-unanswered'
    })
  })
})

describe('nextWslLivenessProbe', () => {
  it('never probes inside a distro that is not confirmed running (an exec would boot it)', () => {
    expect(nextWslLivenessProbe(evidence({ running: { status: 'unavailable' } }))).toBeNull()
    expect(
      nextWslLivenessProbe(evidence({ running: { status: 'confirmed', running: false } }))
    ).toBeNull()
  })

  it('asks for identity first, and for the port only when no pid identity can decide', () => {
    expect(nextWslLivenessProbe(evidence())).toBe('identity')
    expect(
      nextWslLivenessProbe(evidence({ identity: { distroInstance: INSTANCE, markovd: MARKOVD } }))
    ).toBeNull()
    const noPid = evidence({
      expected: { distroInstance: INSTANCE, markovd: null },
      identity: { distroInstance: INSTANCE, markovd: null }
    })
    expect(nextWslLivenessProbe(noPid)).toBe('markovd-port')
    expect(nextWslLivenessProbe({ ...noPid, markovdPort: 'refused' })).toBeNull()
    expect(
      nextWslLivenessProbe({ ...noPid, identity: { distroInstance: 'other', markovd: null } })
    ).toBeNull()
  })
})
