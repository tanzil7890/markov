import { describe, expect, it } from 'vitest'
import {
  buildOrchestrationRecoveryCommand,
  resolveOrchestrationCliExecutable
} from './orchestration-recovery-command'

describe('orchestration recovery command identity', () => {
  it.each([
    ['configured dev', { MARKOV_CLI_COMMAND: 'markov-dev' }, 'darwin', 'markov-dev'],
    ['configured WSL', { MARKOV_CLI_COMMAND: 'markov-ide' }, 'linux', 'markov-ide'],
    ['dev checkout', { MARKOV_DEV_REPO_ROOT: '/repo' }, 'darwin', 'markov-dev'],
    ['packaged Linux', {}, 'linux', 'markov-ide'],
    ['local macOS', {}, 'darwin', 'markov'],
    ['local Windows', {}, 'win32', 'markov']
  ] as const)('resolves the %s CLI identity', (_name, env, platform, expected) => {
    expect(resolveOrchestrationCliExecutable(env, platform)).toBe(expected)
  })

  it('reconstructs the keyed worker-start command from its RPC params', () => {
    expect(
      buildOrchestrationRecoveryCommand(
        'orchestration.workerStart',
        {
          task: 'task_1',
          on: 'windows',
          worktree: 'new-top-level',
          timeoutMs: 90_000,
          devMode: false
        },
        'markov'
      )
    ).toEqual([
      'markov',
      'orchestration',
      'worker-start',
      '--task',
      'task_1',
      '--on',
      'windows',
      '--worktree',
      'new-top-level',
      '--timeout-ms',
      '90000'
    ])
  })

  it('preserves the selected executable and raw command arguments', () => {
    expect(
      buildOrchestrationRecoveryCommand(
        'orchestration.workerStart',
        { task: 'task_1' },
        'markov-dev',
        [
          'orchestration',
          'worker-start',
          '--task',
          'task_1',
          '--comment',
          'literal $(do-not-run) "quoted"',
          '--json'
        ]
      )
    ).toEqual([
      'markov-dev',
      'orchestration',
      'worker-start',
      '--task',
      'task_1',
      '--comment',
      'literal $(do-not-run) "quoted"',
      '--json'
    ])
  })

  it.each([
    ['split', ['orchestration', 'send', '--pairing-code', 'secret', '--subject', 'status']],
    ['equals', ['orchestration', 'send', '--pairing-code=secret', '--subject', 'status']],
    [
      'dispatch split',
      ['orchestration', 'send', '--dispatch-capability', 'secret', '--subject', 'status']
    ],
    [
      'dispatch equals',
      ['orchestration', 'send', '--dispatch-capability=secret', '--subject', 'status']
    ]
  ])('blocks %s credential argv instead of exposing it', (_name, args) => {
    expect(
      buildOrchestrationRecoveryCommand('orchestration.send', {}, 'markov', args)
    ).toBeUndefined()
  })

  it('supports the explicit executable-first form', () => {
    expect(
      buildOrchestrationRecoveryCommand('markov-ide', 'orchestration.workerStop', {
        dispatch: 'dispatch_1'
      })
    ).toEqual(['markov-ide', 'orchestration', 'worker-stop', '--dispatch', 'dispatch_1'])
  })

  it('reconstructs worker-keep-open when raw argv is unavailable', () => {
    expect(
      buildOrchestrationRecoveryCommand('orchestration.workerRetain', {
        dispatch: 'dispatch_1'
      })
    ).toEqual([
      resolveOrchestrationCliExecutable(),
      'orchestration',
      'worker-keep-open',
      '--dispatch',
      'dispatch_1'
    ])
  })

  it('does not fabricate identity for unsupported mutations or malformed params', () => {
    expect(buildOrchestrationRecoveryCommand('orchestration.send', {})).toBeUndefined()
    expect(buildOrchestrationRecoveryCommand('orchestration.workerStart', null)).toBeUndefined()
  })
})
