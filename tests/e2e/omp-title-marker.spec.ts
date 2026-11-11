import { writeFile } from 'node:fs/promises'
import { buildShellCommandFromArgv } from '../../src/shared/agent-launch/startup/tui-agent-startup-shell'
import { test, expect } from './helpers/markov-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  sendToTerminal,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test('OMP spaced-colon title renders working and clears on idle', async ({
  markovPage
}, testInfo) => {
  test.skip(
    process.platform === 'win32',
    'POSIX title replay; Windows formatter bytes have separate coverage'
  )
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  await ensureTerminalVisible(markovPage)
  await waitForActiveTerminalManager(markovPage)
  const ptyId = await waitForActivePanePtyId(markovPage)
  const script = testInfo.outputPath('title-replay.cjs')
  await writeFile(
    script,
    `
process.stdout.write('\\x1b]0;OMP : Image review\\x07')
process.stdin.on('data', () => process.stdout.write('\\x1b]0;OMP > Image review\\x07'))
`
  )
  await execInTerminal(
    markovPage,
    ptyId,
    buildShellCommandFromArgv([process.execPath, script], 'posix')
  )
  const working = markovPage.locator('[aria-label="Working"]')
  await expect(working.first()).toBeVisible({ timeout: 15000 })
  await markovPage.screenshot({ path: testInfo.outputPath('omp-title-working.png') })
  await sendToTerminal(markovPage, ptyId, '\r')
  await expect(working).toHaveCount(0)
  await markovPage.screenshot({ path: testInfo.outputPath('omp-title-idle.png') })
})
