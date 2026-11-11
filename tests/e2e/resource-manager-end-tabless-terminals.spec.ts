import { mkdirSync } from 'node:fs'
import { expect, test } from './helpers/markov-app'
import { makeResourceManagerFixtureVisible } from './helpers/resource-manager-visible-fixture'
import { waitForSessionReady } from './helpers/store'

test.use({ seedTestRepo: false })

test('Resource Manager ends a tab-less terminal this run spawned', async ({
  markovPage,
  electronApp
}, testInfo) => {
  const folderPath = testInfo.outputPath('notes')
  mkdirSync(folderPath, { recursive: true })
  await waitForSessionReady(markovPage)
  await markovPage.setViewportSize({ width: 1200, height: 900 })
  const ptyId = await markovPage.evaluate(async (folderPath) => {
    const state = window.__store!.getState()
    const group = await window.api.projectGroups.create({
      name: 'Notes',
      parentPath: folderPath,
      createdFrom: 'folder-scan'
    })
    await state.fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
    if (!group) {
      throw new Error('Could not create project group')
    }
    const folder = await state.createFolderWorkspace(
      { projectGroupId: group.id, name: 'Notes', folderPath },
      { runtimeEnvironmentId: null }
    )
    if (!folder) {
      throw new Error('Could not create folder workspace')
    }
    const spawned = await window.api.pty.spawn({
      cols: 80,
      rows: 24,
      cwd: folderPath,
      worktreeId: `folder:${folder.id}`,
      initiallyHidden: true
    })
    return spawned.id
  }, folderPath)

  await makeResourceManagerFixtureVisible(electronApp, markovPage)
  await markovPage.getByRole('button', { name: /^Resource Manager,/ }).click()
  await markovPage.getByRole('tab', { name: 'PTYs', exact: true }).click()
  const panel = markovPage.getByRole('tabpanel', { name: /^PTYs/ })
  await expect(panel.getByText(/1 without a tab/)).toBeVisible()
  const rows = panel.locator('[data-resource-pty-row]')
  await rows.getByRole('button', { name: /^End / }).click()
  await expect(markovPage.getByRole('dialog', { name: /^End .*\?$/ })).toHaveCount(0)
  await expect(rows).toHaveCount(0)
  await expect
    .poll(async () =>
      (await markovPage.evaluate(() => window.api.pty.listSessions({ connectionId: null }))).map(
        (session) => session.id
      )
    )
    .not.toContain(ptyId)
})
