import { describe, expect, it } from 'vitest'
import { computeCodexTrustedHash as computeTrustedHash } from '../identity/codex-trust-identity'

// Codex's /hooks identity hash for this command; the algorithm was checked against a real Codex 0.129 approval.
const REAL_APPROVED_COMMAND = '/bin/sh "/tmp/markov-case-b-mCmCe6/agent-hooks/codex-hook.sh"'
const REAL_APPROVED_HASH = 'sha256:556dd7549738381e71cc5345ac5ea361217c06b78fc8865f6d2707831e1b7330'

describe('computeTrustedHash', () => {
  it('reproduces the hash that Codex /hooks wrote for a real approval', () => {
    expect(
      computeTrustedHash({
        sourcePath: '/Users/jamie/.codex/hooks.json',
        eventLabel: 'pre_tool_use',
        groupIndex: 0,
        handlerIndex: 0,
        command: REAL_APPROVED_COMMAND
      })
    ).toBe(REAL_APPROVED_HASH)
  })

  it('pins the matcher-omitted hash for a Stop entry that carries an empty matcher', () => {
    // Hash captured from a real Codex 0.140 config.
    expect(
      computeTrustedHash({
        sourcePath: '/home/user/.codex/hooks.json',
        eventLabel: 'stop',
        groupIndex: 0,
        handlerIndex: 0,
        command: '/home/user/.tma1/hooks/agent-hook.sh',
        matcher: ''
      })
    ).toBe('sha256:f8b48c31eabfba63f117b8570b839a5f6efc1d67867512d661775b5312df946f')
  })
})
