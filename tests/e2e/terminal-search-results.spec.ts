import { test, expect } from './helpers/markov-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  execInTerminal,
  focusActiveTerminalInput,
  getTerminalContent,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

test('terminal search counts real matches and repeat find selects the query', async ({
  markovPage
}, testInfo) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  await ensureTerminalVisible(markovPage)
  await waitForActiveTerminalManager(markovPage, 30_000)
  const ptyId = await waitForActivePanePtyId(markovPage)
  for (let line = 0; line < 3; line++) {
    await execInTerminal(markovPage, ptyId, 'echo markov-search-proof')
  }
  await expect
    .poll(
      async () =>
        (await getTerminalContent(markovPage))
          .split(/\r?\n/)
          .filter((line) => line.trim() === 'markov-search-proof').length
    )
    .toBe(3)
  await focusActiveTerminalInput(markovPage)
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await markovPage.keyboard.press(`${modifier}+f`)
  const search = markovPage.locator('[data-terminal-search-root]')
  const input = search.locator('input')
  await expect(input).toBeFocused()
  await search.getByTitle('Regex', { exact: true }).click()
  const query = '^markov-search-proof$'
  await input.fill(query)
  await expect(search).toContainText(/[1-3]\/3/)
  const initialCount = await search.innerText()
  await input.press('Enter')
  await expect.poll(() => search.innerText()).not.toBe(initialCount)
  await markovPage.screenshot({ path: testInfo.outputPath('search-results.png') })
  await input.press('ArrowLeft')
  await markovPage.keyboard.press(`${modifier}+f`)
  await expect(input).toBeFocused()
  await expect
    .poll(() =>
      input.evaluate((element) =>
        element instanceof HTMLInputElement
          ? { start: element.selectionStart, end: element.selectionEnd }
          : null
      )
    )
    .toEqual({ start: 0, end: query.length })
  await markovPage.screenshot({ path: testInfo.outputPath('search-query-selected.png') })
  await input.fill('no-such-search-result-314159')
  await expect(search).toContainText('No results')
  await input.press('Escape')
  await expect(search).toBeHidden()
})
