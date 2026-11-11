import { test, expect } from './helpers/markov-app'
import { waitForSessionReady, waitForActiveWorktree } from './helpers/store'
import { addRepoWithWorkspaces, writeWorkspaceMeta } from './helpers/repo-with-workspaces'
import { seedLineageScenario } from './worktree-lineage-state'
import { waitForLineageScrollFixtureReady } from './worktree-lineage-scroll-readiness'

test.use({ launchEnv: { MARKOV_BACKGROUND_LAUNCH: '1' } })

test('keyboard and chip preserve the scrolled parent, and unfolding opens the sidebar', async ({
  markovPage,
  electronApp
}, testInfo) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  expect(
    await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible())
    )
  ).toBe(true)
  await markovPage.emulateMedia({ reducedMotion: 'reduce' })
  await markovPage.setViewportSize({ width: 1200, height: 800 })
  const family = await seedLineageScenario(markovPage)
  const surrounding = await addRepoWithWorkspaces(markovPage, testInfo, 40)
  const order = (worktreeId: string, rank: number, displayName?: string) => ({
    worktreeId,
    updates: { sortOrder: rank, manualOrder: rank, ...(displayName ? { displayName } : {}) }
  })
  await writeWorkspaceMeta(markovPage, [
    order(family.parentId, 16.5),
    order(family.childId, 16.4),
    order(surrounding.mainId, 0),
    ...surrounding.ids.map((id, index) => order(id, 40 - index, `Surrounding workspace ${index}`))
  ])
  await markovPage.evaluate(async () => {
    const state = window.__store!.getState()
    state.setSortBy('manual')
    await state.setKeybindingOverride('sidebar.childWorkspaces.toggle', ['Mod+Alt+H'])
  })

  const sidebar = markovPage.locator('[data-worktree-sidebar]')
  const parentRow = sidebar
    .locator(`[role="option"][data-worktree-id=${JSON.stringify(family.parentId)}]`)
    .first()
  const childRow = sidebar
    .locator(`[role="option"][data-worktree-id=${JSON.stringify(family.childId)}]`)
    .first()
  await markovPage.getByRole('button', { name: 'Reveal active workspace' }).click()
  await expect(parentRow).toBeVisible()
  await parentRow.evaluate((row) => row.scrollIntoView({ block: 'center' }))
  await expect.poll(() => sidebar.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const geometry = () =>
    parentRow.evaluate((row) => ({
      top: row.getBoundingClientRect().top,
      scrollTop: row.closest('[data-worktree-sidebar]')?.scrollTop ?? 0
    }))
  await waitForLineageScrollFixtureReady(markovPage, family.parentId)
  const before = await geometry()
  await markovPage.mouse.move(1150, 400)
  await markovPage.keyboard.press('ControlOrMeta+Alt+KeyH')
  await expect(childRow).toBeHidden()
  await expect.poll(async () => Math.abs((await geometry()).top - before.top)).toBeLessThan(2)
  expect((await geometry()).scrollTop).toBeGreaterThan(0)
  const collapsedProof = testInfo.outputPath('keyboard-collapsed-parent-anchor.png')
  await sidebar.screenshot({ path: collapsedProof })
  await testInfo.attach('keyboard-collapsed-parent-anchor', {
    path: collapsedProof,
    contentType: 'image/png'
  })

  await parentRow.getByRole('button', { name: 'Show 1 child workspace' }).click()
  await expect(childRow).toBeVisible()
  await expect.poll(async () => Math.abs((await geometry()).top - before.top)).toBeLessThan(2)
  await markovPage.mouse.move(1150, 400)
  await markovPage.keyboard.press('ControlOrMeta+Alt+KeyH')
  await expect(childRow).toBeHidden()
  await markovPage.evaluate(() => window.__store?.getState().setSidebarOpen(false))
  await expect(sidebar).toBeHidden()
  await markovPage.keyboard.press('ControlOrMeta+Alt+KeyH')
  await expect(sidebar).toBeVisible()
  await expect(childRow).toBeVisible()
})
