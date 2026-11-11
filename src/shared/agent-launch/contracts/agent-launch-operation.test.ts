/** Fingerprint behavioral fields, excluding telemetry: omissions can replay a different launch; extra attribution fields can reject an honest retry. */

import { describe, expect, it } from 'vitest'
import { computeAgentLaunchFingerprint } from './agent-launch-operation'
import { canonicalAgentSessionDigest } from '../../agent-session/lifecycle/agent-session-mutation-envelope'

describe('transient cwd observation is not launch intent', () => {
  const create = {
    repo: 'id:00000000-0000-4000-8000-000000000099',
    name: 'child',
    displayName: 'child',
    displayNameKind: 'user',
    runHooks: false,
    activate: false,
    cwdParentWorktree:
      'id:00000000-0000-4000-8000-000000000001::/Users/exampleperson/mark/workspaces/mark/replay-parent::workspace:90ac0c9c-ef88-4f6a-a818-904b4b2c9ada',
    noParent: false,
    callerTerminalHandle: 'term_R',
    cliProvenanceRequest: { callerTerminalHandle: 'term_R' }
  }
  it.each([
    ['term_R', '01828175a5f68dd2a8f089c8eeb022474a66134251b252a0121f6c3a0c2ca51b'],
    ['term_X', 'f0f3348e758996810c020bd8053d494bd67b54d35b8d752ce74be0d8becda2b3']
  ])('keeps literal old digest and input bytes for %s', (handle, digest) => {
    const target = {
      kind: 'create-worktree' as const,
      create: {
        ...create,
        callerTerminalHandle: handle,
        cliProvenanceRequest: { callerTerminalHandle: handle }
      }
    }
    const input = { agent: 'codex', target }
    const before = JSON.stringify(input)
    expect(computeAgentLaunchFingerprint(input)).toBe(digest)
    expect(
      computeAgentLaunchFingerprint({
        ...input,
        target: { ...target, create: { ...target.create, cwdParentAmbiguous: true } }
      })
    ).toBe(digest)
    expect(JSON.stringify(input)).toBe(before)
    expect(computeAgentLaunchFingerprint(input)).toBe(
      canonicalAgentSessionDigest({ method: 'agent.launch', ...input })
    )
  })
  it.each([
    { cwdParentWorktree: 'id:another' },
    { parentWorktree: 'id:explicit' },
    { parentWorkspace: 'folder:r' },
    { noParent: true },
    { repo: 'id:other' },
    { name: 'other' },
    { envParentWorkspace: 'folder:s' },
    { callerTerminalHandle: 'term_X' },
    { orchestrationContext: { taskId: 'task_t' } },
    { createIdentity: { instanceId: 'instance' } },
    { futureLegitimateField: true }
  ])('preserves every other create field, including unknown legitimate fields: %j', (change) => {
    const input = { agent: 'codex', target: { kind: 'create-worktree' as const, create } }
    expect(
      computeAgentLaunchFingerprint({
        ...input,
        target: { ...input.target, create: { ...create, ...change, cwdParentAmbiguous: true } }
      })
    ).not.toBe(computeAgentLaunchFingerprint(input))
  })
})
