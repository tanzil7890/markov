import { describe, expect, it } from 'vitest'

import { computeCodexTrustedHash as computeTrustedHash } from '../identity/codex-trust-identity'
import type { CodexTrustEntry } from '../toml/config-toml-trust'

// Frozen form-1 fixture: Codex's Interrupt identity hash with timeout 3 (algorithm checked against codex-cli 0.159.3 hooks/list).
const MARKOV_FORM_1_COMMAND =
  ': markov-agent-hook-form=1; if [ -n "${MARKOV_PANE_KEY-}" ] && [ -n "${MARKOV_AGENT_HOOK_ROOT-}" ] && [ -f "${MARKOV_AGENT_HOOK_ROOT-}/agent-hooks/codex-hook.sh" ]; then /bin/sh "${MARKOV_AGENT_HOOK_ROOT-}/agent-hooks/codex-hook.sh" || :; elif [ -z "${MARKOV_AGENT_HOOK_ROOT-}" ] && [ -n "${MARKOV_PANE_KEY-}" ] && [ -n "${MARKOV_AGENT_HOOK_PORT-}" ] && [ -f "${HOME-}/.markov/agent-hooks/codex-hook.sh" ]; then /bin/sh "${HOME-}/.markov/agent-hooks/codex-hook.sh" || :; else { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || :; fi'
const REAL_INTERRUPT_HASH =
  'sha256:04be1b3b4362f99997cbab43974e93f8e4795383c7f331eee1de9f495719021a'

const INTERRUPT_ENTRY: CodexTrustEntry = {
  sourcePath: '/home/dev/.codex/hooks.json',
  eventLabel: 'interrupt',
  groupIndex: 0,
  handlerIndex: 0,
  command: MARKOV_FORM_1_COMMAND,
  timeoutSec: 3
}

describe('the managed Codex Interrupt hook', () => {
  it('reproduces the hash real Codex computed for the Interrupt hook', () => {
    expect(computeTrustedHash(INTERRUPT_ENTRY)).toBe(REAL_INTERRUPT_HASH)
  })
})
