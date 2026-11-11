import {
  KEY_LATENCY_SAMPLES,
  MAX_MEDIAN_KEY_LATENCY_MS,
  MAX_WORST_KEY_LATENCY_MS,
  interactivePromptScript,
  waitForMarkerLatency,
  median
} from './helpers/terminal-typing-benchmark'
import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/markov-app'
import {
  focusActiveTerminalInput,
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput,
  sendToTerminal
} from './helpers/terminal'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test.describe('Terminal typing latency', () => {
  test('interactive prompt echoes typed keys without visible lag', async ({
    markovPage,
    testRepoPath
  }, testInfo) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    await ensureTerminalVisible(markovPage)
    await waitForActiveTerminalManager(markovPage, 30_000)

    const ptyId = await waitForActivePanePtyId(markovPage)
    const runId = randomUUID()
    const scriptPath = path.join(testRepoPath, `.markov-typing-benchmark-${runId}.mjs`)
    writeFileSync(scriptPath, interactivePromptScript(runId))
    let commandSent = false
    try {
      await sendToTerminal(markovPage, ptyId, `node ${JSON.stringify(scriptPath)}\r`)
      commandSent = true
      await waitForTerminalOutput(markovPage, `TYPING_READY_${runId}`, 10_000)
      await focusActiveTerminalInput(markovPage)

      const latencies: number[] = []
      for (const [index, char] of [...KEY_LATENCY_SAMPLES].entries()) {
        const seq = index + 1
        const marker = `TYPING_KEY_${runId}_${seq}`
        const start = performance.now()
        await markovPage.keyboard.type(char)
        await waitForMarkerLatency(markovPage, marker, MAX_WORST_KEY_LATENCY_MS)
        latencies.push(performance.now() - start)
      }

      const medianLatency = median(latencies)
      const worstLatency = Math.max(...latencies)
      testInfo.annotations.push({
        type: 'terminal-typing-latency',
        description: `median=${medianLatency.toFixed(1)}ms worst=${worstLatency.toFixed(1)}ms samples=${latencies
          .map((value) => value.toFixed(1))
          .join(',')}`
      })

      expect(medianLatency).toBeLessThan(MAX_MEDIAN_KEY_LATENCY_MS)
      expect(worstLatency).toBeLessThan(MAX_WORST_KEY_LATENCY_MS)
    } finally {
      if (commandSent) {
        await sendToTerminal(markovPage, ptyId, '\x03').catch(() => undefined)
      }
      rmSync(scriptPath, { force: true })
    }
  })
})
