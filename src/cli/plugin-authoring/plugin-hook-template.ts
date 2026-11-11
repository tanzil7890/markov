import { PLUGIN_HOOKS_SINCE } from '../../shared/plugins/manifest/plugin-schema-field-docs'
import {
  COMMON_FILES,
  json,
  manifest,
  readme,
  type PluginTemplate,
  type PluginTemplateInput
} from './plugin-template-files'
import { PLUGIN_TYPES_DIR } from './plugin-type-files'

const WORKER_TS = `// A guard: Markov asks this worker before it types text into a terminal (terminal.send).
// Markov transpiles this file when it loads: no build step.
import type { MarkovWorkerApi } from 'markov/worker'

const BLOCKED = [/\\brm\\s+-rf\\s+\\/(?:\\s|$)/, /\\bmkfs\\b/]

export default function activate(markov: MarkovWorkerApi): void {
  markov.hooks.on('terminal.send', (event) => {
    // Decide first: an awaited call before returning could fail or time out and let it through.
    if (BLOCKED.some((pattern) => pattern.test(event.text))) {
      markov.log(\`blocked in \${event.terminalId}: \${event.text}\`)
      return { deny: 'blocked by the guard plugin' }
    }
    // Returning nothing passes the send on unchanged.
    return undefined
  })
}
`

const WORKER_TEST_TS = `// Runs the hook as Markov would, with this worker as the only plugin in the chain.
import { assert, mountWorker, test } from 'markov/testing'
import * as main from './worker'

const send = (text: string) => ({ terminalId: 't1', text, enter: true, inputKind: 'driving' as const })

test('refuses a dangerous command and passes everything else unchanged', async () => {
  const worker = await mountWorker(main)
  assert.deepEqual(await worker.hooks.fire('terminal.send', send('rm -rf /')), {
    kind: 'deny',
    reason: 'blocked by the guard plugin'
  })
  assert.deepEqual(await worker.hooks.fire('terminal.send', send('ls -la ')), {
    kind: 'continue',
    event: send('ls -la ')
  })
  await worker.deactivate()
})
`

/** A worker-only guard on `terminal.send`, failing closed, with its test. */
export function hook(input: PluginTemplateInput): PluginTemplate {
  return {
    description:
      'Worker-only hook that refuses dangerous terminal commands, with a test (needs --approve to load)',
    files: {
      'markov-plugin.json': manifest(input, 'Refuses dangerous commands sent to terminals.', {
        engines: { markov: `>=${PLUGIN_HOOKS_SINCE}` },
        execution: 'trusted-worker',
        pluginApi: 1,
        main: 'src/worker.ts',
        // Why deny: a guard that crashes or times out must not let the command through.
        contributes: { hooks: [{ event: 'terminal.send', onError: 'deny' }] }
      }),
      'src/worker.ts': WORKER_TS,
      'src/worker.test.ts': WORKER_TEST_TS,
      'tsconfig.json': json({ extends: `./${PLUGIN_TYPES_DIR}/tsconfig.json`, include: ['src'] }),
      'README.md': readme(
        input,
        `A guard (\`src/worker.ts\`) on the \`terminal.send\` hook: before Markov, the CLI or a plugin types text into a terminal, the worker can refuse it with \`{ deny }\` or pass it on. \`"onError": "deny"\` in \`markov-plugin.json\` makes a crash or timeout refuse the send too. \`markov plugin test .\` runs \`src/worker.test.ts\` with \`markov/testing\`; with the folder loaded, \`markov plugin dev hook . terminal.send --data '{"terminalId":"t1","text":"rm -rf /","enter":true,"inputKind":"driving"}'\` prints what the chain decides.`
      ),
      ...COMMON_FILES
    }
  }
}
