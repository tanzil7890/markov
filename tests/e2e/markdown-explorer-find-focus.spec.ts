import { expect, test } from './helpers/markov-app'
import { openFileExplorer } from './helpers/file-explorer'
import { pressShortcut } from './helpers/shortcuts'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

test('Explorer-opened Markdown accepts the find shortcut without a document click', async ({
  markovPage
}) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  await openFileExplorer(markovPage)

  const readmeRow = markovPage.locator('[data-file-explorer-row]').filter({ hasText: 'README.md' })
  await expect(readmeRow).toBeVisible({ timeout: 10_000 })
  await readmeRow.focus()
  await readmeRow.click()

  await expect(markovPage.locator('.rich-markdown-editor')).toBeVisible({ timeout: 25_000 })
  await pressShortcut(markovPage, 'f')

  await expect(
    markovPage.getByRole('textbox', { name: 'Find in rich markdown editor' })
  ).toBeVisible()
})
