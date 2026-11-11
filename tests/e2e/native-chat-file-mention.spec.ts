import { test, expect } from './helpers/markov-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { showActivePaneAsNativeChat } from './helpers/native-chat-view'
import { waitForActiveTerminalManager } from './helpers/terminal'

test('typing @ in the chat composer lists workspace files and inserts the chosen one', async ({
  markovPage
}, testInfo) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  await ensureTerminalVisible(markovPage)
  await waitForActiveTerminalManager(markovPage)
  await showActivePaneAsNativeChat(markovPage, 'claude', 'Claude')

  const composer = markovPage.getByRole('textbox', {
    name: 'Ask anything, @ to mention files, / for commands',
    exact: true
  })
  await expect(composer).toBeVisible()
  await composer.click()

  await markovPage.keyboard.type('review @')
  // The sidebar's worktree list is a listbox too.
  const files = markovPage.locator('[role="listbox"][id^="native-chat-picker-"]')
  await expect(files.getByRole('option', { name: /README\.md/ })).toBeVisible()
  await markovPage.screenshot({ path: testInfo.outputPath('mention-all-files.png') })

  await markovPage.keyboard.type('index')
  const match = files.getByRole('option', { name: /index\.ts/ })
  await expect(match).toHaveAttribute('aria-selected', 'true')
  await expect(files.getByRole('option', { name: /README\.md/ })).toHaveCount(0)
  await markovPage.screenshot({ path: testInfo.outputPath('mention-filtered.png') })

  await markovPage.keyboard.press('Enter')
  await expect(composer).toHaveText('review @src/index.ts ')
  await expect(files).toHaveCount(0)

  await markovPage.keyboard.type('@zzz-no-such-file')
  await expect(files).toContainText('No matching files')
  // A one-off app tooltip can be open and takes the first Escape for itself.
  await expect(async () => {
    await markovPage.keyboard.press('Escape')
    await expect(files).toHaveCount(0, { timeout: 1000 })
  }).toPass()
  await markovPage.keyboard.type('x')
  await expect(composer).toContainText('@zzz-no-such-filex')
  await expect(files).toHaveCount(0)
  await markovPage.keyboard.type(' @')
  await expect(files.getByRole('option', { name: /README\.md/ })).toBeVisible()
})
