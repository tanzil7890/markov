import { test, expect } from './helpers/markov-app'
import {
  ensureTerminalVisible,
  getAllWorktreeIds,
  switchToWorktree,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import {
  waitForActivePanePtyId,
  waitForActiveTerminalManager,
  waitForTerminalOutput
} from './helpers/terminal'

test('Cmd+J focuses the terminal after waking a sleeping workspace', async ({
  markovPage
}, testInfo) => {
  await waitForSessionReady(markovPage)
  const source = await waitForActiveWorktree(markovPage)
  const target = (await getAllWorktreeIds(markovPage)).find((id) => id !== source)
  if (!target) {
    throw new Error('Expected a second seeded workspace')
  }
  await switchToWorktree(markovPage, target)
  await ensureTerminalVisible(markovPage)
  await waitForActiveTerminalManager(markovPage)
  await waitForActivePanePtyId(markovPage)
  const targetName = await markovPage.evaluate((id) => {
    const state = window.__store!.getState()
    const worktree = state.getKnownWorktreeById(id)
    if (!worktree) {
      throw new Error('Missing target workspace')
    }
    return worktree.branch.replace(/^refs\/heads\//, '')
  }, target)
  await switchToWorktree(markovPage, source)
  await markovPage.evaluate(async (id) => {
    await window.__store!.getState().shutdownWorktreeTerminals(id, { keepIdentifiers: true })
  }, target)
  await markovPage.evaluate(() => {
    const listSessions = window.api.pty.listSessions
    window.api.pty.listSessions = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 100))
      return listSessions(...args)
    }
  })
  // Native menu accelerators require OS focus; open the same palette in the hidden renderer.
  await markovPage.evaluate(() => window.__store!.getState().openModal('worktree-palette'))
  const dialog = markovPage.getByRole('dialog', { name: 'Jump to...' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox').fill(targetName)
  await expect(dialog.locator('[cmdk-item][data-selected="true"]')).toContainText(targetName)
  const cdp = await markovPage.context().newCDPSession(markovPage)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 })
  await markovPage.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await waitForActiveTerminalManager(markovPage)
  await waitForActivePanePtyId(markovPage)
  const terminal = markovPage
    .locator('[data-terminal-tab-id]:visible .xterm-helper-textarea')
    .first()
  await markovPage.screenshot({ path: testInfo.outputPath('wake-focus.png') })
  await expect(terminal).toBeFocused()
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await cdp.detach()
  await markovPage.keyboard.type('echo WAKE_KEYBOARD_OK')
  await markovPage.keyboard.press('Enter')
  await waitForTerminalOutput(markovPage, 'WAKE_KEYBOARD_OK')
  await markovPage.screenshot({ path: testInfo.outputPath('wake-typing.png') })
})
