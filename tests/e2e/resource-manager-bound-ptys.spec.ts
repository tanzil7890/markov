import { expect, test } from './helpers/markov-app'
import { makeResourceManagerFixtureVisible } from './helpers/resource-manager-visible-fixture'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { waitForActivePanePtyId } from './helpers/terminal'

for (const theme of ['light', 'dark'] as const) {
  test(`PTY navigation keeps Resource Manager open while browsing and ending terminals (${theme})`, async ({
    electronApp,
    markovPage
  }, testInfo) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    await ensureTerminalVisible(markovPage)
    await markovPage.setViewportSize({ width: 1200, height: 900 })
    await markovPage.evaluate(async (theme) => {
      await window.__store!.getState().updateSettingsOrThrow({ theme })
    }, theme)
    const terminals: { tabId: string; ptyId: string; title: string }[] = []
    for (const title of ['Terminal 1', 'Terminal 8', '工作日仓库审计 run 33']) {
      const tabId = await markovPage.evaluate(
        ({ title, create }) => {
          const state = window.__store!.getState()
          const workspaceId = state.activeWorktreeId
          if (!workspaceId || !state.activeTabId) {
            throw new Error('Missing active workspace or tab')
          }
          const tabId = create ? state.createTab(workspaceId).id : state.activeTabId
          state.setActiveTab(tabId)
          state.setTabCustomTitle(tabId, title)
          return tabId
        },
        { title, create: terminals.length > 0 }
      )
      terminals.push({ title, tabId, ptyId: await waitForActivePanePtyId(markovPage) })
    }
    await makeResourceManagerFixtureVisible(electronApp, markovPage)
    const openPtys = async (): Promise<void> => {
      await markovPage.getByRole('button', { name: /^Resource Manager,/ }).click()
      await markovPage.getByRole('tab', { name: /^PTYs/ }).click()
    }
    await openPtys()
    await expect(markovPage.getByText('3 Markov PTYs on this computer')).toBeVisible()
    const body = markovPage.locator('[data-resource-pty-body]')
    await markovPage.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`bound-ptys-collapsed-${theme}.png`)
    })
    for (const terminal of terminals) {
      await expect(
        body.getByRole('button', { name: `Open ${terminal.title}`, exact: true })
      ).toBeVisible()
      await expect(
        body.getByRole('button', { name: `End ${terminal.title}`, exact: true })
      ).toBeEnabled()
    }
    const panel = markovPage.getByRole('tabpanel', { name: /^PTYs/ })
    const first = terminals[0]
    await expect(panel.getByRole('searchbox')).toHaveCount(0)
    await expect(panel.getByRole('combobox')).toHaveCount(0)
    await expect(body.getByRole('button', { name: 'Open Terminal 8', exact: true })).toBeVisible()
    const details = body.getByRole('button', { name: `Details for ${first.title}`, exact: true })
    await details.click()
    await expect(details).toHaveAttribute('aria-expanded', 'true')
    await expect(body.locator('dl').getByText(first.ptyId, { exact: true })).toBeVisible()
    await details.click()
    for (const terminal of terminals) {
      await body.getByRole('button', { name: `Open ${terminal.title}`, exact: true }).click()
      await expect(body).toBeVisible()
      await expect(
        markovPage.locator(`[data-testid="sortable-tab"][data-tab-id="${terminal.tabId}"]`)
      ).toHaveAttribute('data-active', 'true')
    }
    await body.getByRole('button', { name: `End ${first.title}`, exact: true }).click()
    await expect(markovPage.getByRole('dialog', { name: `End ${first.title}?` })).toHaveCount(0)
    await expect(markovPage.getByText('2 Markov PTYs on this computer')).toBeVisible()
    await expect(
      body.getByRole('button', { name: `Open ${first.title}`, exact: true })
    ).toHaveCount(0)
    await markovPage.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`bound-ptys-${theme}.png`)
    })
    await expect(markovPage.getByRole('heading', { name: `End ${first.title}?` })).toHaveCount(0)
    for (const terminal of terminals.slice(1)) {
      await body.getByRole('checkbox', { name: `Select ${terminal.title}`, exact: true }).check()
    }
    await markovPage.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`bound-ptys-selected-${theme}.png`)
    })
    await panel.getByRole('button', { name: 'End selected (2)', exact: true }).click()
    await expect(markovPage.getByText('0 Markov PTYs on this computer')).toBeVisible()
    await expect(body.getByText('No local Markov PTYs', { exact: true })).toBeVisible()
    await expect(markovPage.getByRole('dialog', { name: /^End / })).toHaveCount(0)
    await markovPage.keyboard.press('Escape')
    await expect(body).toHaveCount(0)
  })
}
