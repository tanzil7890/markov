import { test, expect } from './helpers/markov-app'
import {
  waitForSessionReady,
  waitForActiveWorktree,
  getActiveWorktreeId,
  getActiveTabType,
  getOpenFiles,
  ensureTerminalVisible
} from './helpers/store'
import { clickFileInExplorer, openFileExplorer } from './helpers/file-explorer'

test.describe('File Open & Markdown Preview', () => {
  test.beforeEach(async ({ markovPage }) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    await ensureTerminalVisible(markovPage)
  })

  test('clicking a file in the file explorer opens it in an editor tab', async ({ markovPage }) => {
    const worktreeId = (await getActiveWorktreeId(markovPage))!
    await openFileExplorer(markovPage)

    const filesBefore = await getOpenFiles(markovPage, worktreeId)

    const clickedFile = await clickFileInExplorer(markovPage, [
      'package.json',
      'tsconfig.json',
      '.gitignore',
      'README.md'
    ])
    expect(clickedFile).not.toBeNull()

    await expect.poll(async () => getActiveTabType(markovPage), { timeout: 5_000 }).toBe('editor')

    await expect
      .poll(async () => (await getOpenFiles(markovPage, worktreeId)).length, { timeout: 5_000 })
      .toBeGreaterThan(filesBefore.length)

    // Assert the rendered path; allow first-open lazy EditorPanel/Monaco/Markdown chunks to mount.
    await expect(markovPage.locator('.editor-header-path').first()).toContainText(clickedFile!, {
      timeout: 20_000
    })
  })

  test('opening a .md file shows markdown content', async ({ markovPage }) => {
    await openFileExplorer(markovPage)
    const clickedFile = await clickFileInExplorer(markovPage, ['README.md', 'CLAUDE.md'])
    expect(clickedFile).not.toBeNull()

    await expect.poll(async () => getActiveTabType(markovPage), { timeout: 5_000 }).toBe('editor')

    // Assert the file’s real heading so a blank editor cannot pass via store state.
    const expectedHeading = clickedFile?.endsWith('README.md')
      ? /Markov E2E Test Repo/i
      : /CLAUDE\.md/i
    // Allow cold EditorPanel → Markdown chunk loading and ProseMirror boot before the heading paints.
    await expect(markovPage.getByRole('heading', { name: expectedHeading, level: 1 })).toBeVisible({
      timeout: 25_000
    })
  })
})
