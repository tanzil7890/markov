import type { Page, TestInfo } from '@playwright/test'
import { expect, test } from './helpers/markov-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'

async function captureProof(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  if (process.env.MARKOV_E2E_RECORD_VIDEO === '1') {
    return
  }
  const screenshotPath = testInfo.outputPath(name)
  await page.screenshot({ path: screenshotPath })
  await testInfo.attach(name, { path: screenshotPath, contentType: 'image/png' })
}

test.describe('Workspace emoji picker', () => {
  test.beforeEach(async ({ markovPage }) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    await ensureTerminalVisible(markovPage)
    await markovPage.waitForTimeout(750)
  })

  test('inserts emoji in sidebar rename, worktree details, and Cmd+J', async ({
    markovPage
  }, testInfo) => {
    const title = markovPage.locator('[data-worktree-title-inline-rename=""]').first()
    await expect(title).toBeVisible()
    await title.dblclick()

    const inlineInput = markovPage.locator('[data-worktree-title-rename-input="true"]')
    await expect(inlineInput).toBeVisible()
    await inlineInput.fill('Sidebar proof')
    await captureProof(markovPage, testInfo, 'sidebar-rename-before.png')
    await inlineInput.pressSequentially(' :wink', { delay: 60 })
    const inlineSuggestions = markovPage.locator('[data-workspace-emoji-suggestions="true"]')
    await expect(inlineSuggestions.getByRole('option', { name: ':wink:' })).toBeVisible()
    await captureProof(markovPage, testInfo, 'sidebar-rename-picker.png')
    await inlineInput.press('Enter')
    await expect(inlineInput).toHaveValue('Sidebar proof 😉 ')
    await inlineInput.press('Enter')
    await expect(markovPage.getByText('Sidebar proof 😉', { exact: true }).first()).toBeVisible()

    await markovPage.evaluate(() => {
      const state = window.__store!.getState()
      const worktree = Object.values(state.worktreesByRepo)
        .flat()
        .find((candidate) => candidate.id === state.activeWorktreeId)
      if (!worktree) {
        throw new Error('Active worktree not found')
      }
      state.openModal('edit-meta', {
        worktreeId: worktree.id,
        repoId: worktree.repoId,
        currentDisplayName: worktree.displayName,
        currentComment: worktree.comment,
        focus: 'displayName'
      })
    })

    const detailsDialog = markovPage.getByRole('dialog', { name: 'Workspace details' })
    const displayNameInput = detailsDialog.getByPlaceholder('Custom display name...')
    await expect(displayNameInput).toBeFocused()
    await displayNameInput.fill('Details proof')
    await captureProof(markovPage, testInfo, 'worktree-details-before.png')
    await displayNameInput.pressSequentially(' :wink', { delay: 60 })
    const detailsSuggestions = detailsDialog.locator('[data-workspace-emoji-suggestions="true"]')
    await expect(detailsSuggestions.getByRole('option', { name: ':wink:' })).toBeVisible()
    await captureProof(markovPage, testInfo, 'worktree-details-picker.png')
    await displayNameInput.press('Enter')
    await expect(displayNameInput).toHaveValue('Details proof 😉 ')
    await detailsDialog.getByRole('button', { name: 'Cancel' }).click()

    await markovPage.evaluate(() => window.__store!.getState().openModal('worktree-palette'))
    const palette = markovPage.getByRole('dialog', { name: 'Jump to...' })
    const paletteInput = palette.getByPlaceholder('Search or jump to…')
    await expect(paletteInput).toBeFocused()
    await captureProof(markovPage, testInfo, 'cmd-j-before.png')
    await paletteInput.pressSequentially(':wink', { delay: 60 })
    const paletteSuggestions = palette.locator('[data-workspace-emoji-suggestions="true"]')
    await expect(paletteSuggestions.getByRole('option', { name: ':wink:' })).toBeVisible()
    await captureProof(markovPage, testInfo, 'cmd-j-picker.png')
    await paletteInput.press('Enter')
    await expect(paletteInput).toHaveValue('😉 ')
    await expect(palette.getByText('Sidebar proof 😉', { exact: true }).first()).toBeVisible()
    await markovPage.waitForTimeout(750)
  })
})
