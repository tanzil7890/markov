import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildShellCommandFromArgv,
  resolveStartupShell
} from '../../src/shared/agent-launch/startup/tui-agent-startup-shell'
import { resolveLocalWindowsAgentStartupShell } from '../../src/shared/windows-terminal-shell'
import { test, expect } from './helpers/markov-app'
import { emitCodexHookStatus, readHookEndpoint } from './helpers/agent-hook-endpoint'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  focusActiveTerminalInput,
  execInTerminal,
  waitForActivePanePtyId,
  waitForTerminalOutput,
  waitForActivePaneHookDescriptor,
  waitForActiveTerminalManager
} from './helpers/terminal'

// Replay navigation input through a real PTY; hook and rollout fixtures own agent status.
for (const navigation of ['Control+c', 'F3 search', '/permissions'] as const) {
  test(`Codex ${navigation} preserves working status until a confirmed interruption`, async ({
    markovPage,
    electronApp
  }, testInfo) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    await ensureTerminalVisible(markovPage)
    await waitForActiveTerminalManager(markovPage, 30_000)
    const endpoint = await readHookEndpoint(electronApp)
    const descriptor = await waitForActivePaneHookDescriptor(markovPage)
    await markovPage.evaluate(() => {
      const state = window.__store?.getState()
      state?.setAgentActivityDisplayMode('full')
      if (state && !state.worktreeCardProperties.includes('inline-agents')) {
        state.setWorktreeCardProperties([...state.worktreeCardProperties, 'inline-agents'])
      }
    })
    const dir = mkdtempSync(join(tmpdir(), 'markov-codex-interruption-'))
    const transcriptPath = join(dir, 'rollout-root.jsonl')
    writeFileSync(
      transcriptPath,
      `${JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-1' } })}\n`
    )
    try {
      const inputScript = join(dir, 'codex-input.cjs')
      writeFileSync(
        inputScript,
        `
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdin.on('data', (chunk) => {
  if (chunk.includes(3)) process.stdout.write('MARKOV_CTRL_C_RECEIVED\\n')
  if (chunk.toString() === '\\x1bOR' || chunk.toString() === '\\x1b[13~') {
    process.stdout.write('MARKOV_F3_SEARCH_OPENED\\n')
  }
  if (chunk.includes(13)) process.stdout.write('MARKOV_PERMISSIONS_OPENED\\n')
  if (chunk.toString() === '\\x1b') process.stdout.write('MARKOV_ESCAPE_RECEIVED: view dismissed; main task continues\\n')
})
process.stdout.write('MARKOV_CODEX_INPUT_READY\\n')
`
      )
      const terminalWindowsShell = await markovPage.evaluate(
        () => window.__store?.getState().settings?.terminalWindowsShell
      )
      const shell = resolveStartupShell(
        process.platform,
        resolveLocalWindowsAgentStartupShell({
          platform: process.platform,
          isRemote: false,
          terminalWindowsShell
        })
      )
      const ptyId = await waitForActivePanePtyId(markovPage)
      await execInTerminal(
        markovPage,
        ptyId,
        buildShellCommandFromArgv([process.execPath, inputScript], shell)
      )
      await waitForTerminalOutput(markovPage, 'MARKOV_CODEX_INPUT_READY')
      await emitCodexHookStatus(endpoint, {
        ...descriptor,
        transcriptPath,
        sessionId: 'main-session',
        state: 'working',
        prompt: 'Main task continues'
      })
      const working = markovPage.locator('[aria-label="Working"]')
      const interrupted = markovPage.locator('[aria-label="Interrupted"]')
      await expect(working.first()).toBeVisible()
      await emitCodexHookStatus(endpoint, {
        ...descriptor,
        state: 'working',
        sessionId: 'side-session',
        transcriptPath: null,
        prompt: 'Side chat'
      })
      await expect(markovPage.getByText('Main task continues', { exact: true })).toBeVisible()
      await focusActiveTerminalInput(markovPage)
      const key = navigation === 'Control+c' ? 'Control+c' : 'Escape'
      if (navigation === 'F3 search') {
        await markovPage.keyboard.press('F3')
        await waitForTerminalOutput(markovPage, 'MARKOV_F3_SEARCH_OPENED')
      } else if (navigation === '/permissions') {
        await markovPage.keyboard.type('/permissions')
        await markovPage.keyboard.press('Enter')
        await waitForTerminalOutput(markovPage, 'MARKOV_PERMISSIONS_OPENED')
      }
      await markovPage.keyboard.press(key)
      await waitForTerminalOutput(
        markovPage,
        key === 'Escape' ? 'MARKOV_ESCAPE_RECEIVED' : 'MARKOV_CTRL_C_RECEIVED'
      )
      // Allow the old 500 ms inference timer to fire before recording the rendered result.
      await markovPage.waitForTimeout(1_000)
      await markovPage.screenshot({
        path: testInfo.outputPath('status-after-input.png')
      })
      await expect(interrupted).toHaveCount(0)
      await expect(working.first()).toBeVisible()

      appendFileSync(
        transcriptPath,
        `${JSON.stringify({ type: 'event_msg', payload: { type: 'turn_aborted', turn_id: 'turn-1', reason: 'interrupted' } })}\n`
      )
      await expect(interrupted.first()).toBeVisible()
      await expect(working).toHaveCount(0)
      await markovPage.screenshot({
        path: testInfo.outputPath('status-after-confirmed-interruption.png')
      })
      await emitCodexHookStatus(endpoint, {
        ...descriptor,
        state: 'working',
        prompt: 'Next main task'
      })
      await expect(working.first()).toBeVisible()
      await expect(interrupted).toHaveCount(0)
      await emitCodexHookStatus(endpoint, { ...descriptor, state: 'done' })
      await expect(working).toHaveCount(0)
      await expect(interrupted).toHaveCount(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}
