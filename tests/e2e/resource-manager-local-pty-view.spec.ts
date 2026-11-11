import { expect, test } from './helpers/markov-app'
import { makeResourceManagerFixtureVisible } from './helpers/resource-manager-visible-fixture'
import { waitForSessionReady } from './helpers/store'

type PtyViewCounts = { listing: number; metrics: number; kills?: unknown[] }

declare global {
  var __ptyViewCounts: PtyViewCounts | undefined
}

test.use({ seedTestRepo: false })

test('a real hidden window performs no Resource Manager diagnostics and vetoes forced tagged calls', async ({
  electronApp,
  markovPage
}) => {
  await waitForSessionReady(markovPage)
  await electronApp.evaluate(({ ipcMain }) => {
    type InvokeHandler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: Electron's private invoke registry is checked before wrapping the real handlers.
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, InvokeHandler> })
      ._invokeHandlers
    const counts: PtyViewCounts = { listing: 0, metrics: 0 }
    globalThis.__ptyViewCounts = counts
    for (const [channel, key] of [
      ['pty:listSessions', 'listing'],
      ['memory:getSnapshot', 'metrics']
    ] as const) {
      const original = handlers.get(channel)
      if (!original) {
        throw new Error(`Missing ${channel}`)
      }
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, (event, ...args) => {
        if (
          args.some((value) => value && typeof value === 'object' && 'resourceManagerView' in value)
        ) {
          counts[key]++
        }
        return original(event, ...args)
      })
    }
  })
  await markovPage.getByRole('button', { name: /^Resource Manager,/ }).click()
  await markovPage.getByRole('tab', { name: 'PTYs', exact: true }).click()
  await expect(markovPage.getByText('Loading terminals…', { exact: true })).toBeVisible()
  await markovPage.waitForTimeout(2_100)
  expect(
    await electronApp.evaluate(() => {
      if (!globalThis.__ptyViewCounts) {
        throw new Error('PTY view counters missing')
      }
      return globalThis.__ptyViewCounts
    })
  ).toEqual({ listing: 0, metrics: 0 })
  expect(await markovPage.evaluate(() => window.api.memory.resourceWindowVisible())).toBe(false)
  const veto = await markovPage.evaluate(async () => {
    try {
      await window.api.pty.listSessions({ connectionId: null }, { resourceManagerView: true })
      return 'unexpected success'
    } catch (error) {
      return String(error)
    }
  })
  expect(veto).toContain('view_not_visible')
  await expect(markovPage.getByText(/Unverifiable: local terminals/)).toHaveCount(0)
})

for (const { theme, sessionCount, viewportHeight } of [
  { theme: 'dark', sessionCount: 1_000, viewportHeight: 900 },
  { theme: 'light', sessionCount: 1_000, viewportHeight: 900 },
  { theme: 'dark', sessionCount: 20, viewportHeight: 500 },
  { theme: 'light', sessionCount: 10_000, viewportHeight: 500 }
] as const) {
  test(`local PTY review and background ending with ${sessionCount} sessions (${theme}, ${viewportHeight}px)`, async ({
    electronApp,
    markovPage
  }, testInfo) => {
    await waitForSessionReady(markovPage)
    await markovPage.setViewportSize({ width: 1200, height: viewportHeight })
    await electronApp.evaluate(({ ipcMain }, sessionCount) => {
      const rows = Array.from({ length: sessionCount }, (_, index) => ({
        id: `local-pty-${String(index).padStart(4, '0')}`,
        incarnationId: `incarnation-${index}`,
        title: `Terminal ${index}`,
        ...(index === sessionCount - 1 ? { foregroundProcess: 'node' } : {}),
        cwd: `/workspace/folder-${index}`,
        agentOwnership: index === 0 ? 'unknown' : 'absent',
        fencedTermination: index !== sessionCount - 2
      }))
      const counts: Required<PtyViewCounts> = {
        listing: 0,
        metrics: 0,
        kills: []
      }
      globalThis.__ptyViewCounts = counts
      for (const channel of [
        'pty:listSessions',
        'memory:getSnapshot',
        'memory:resourceWindowVisible',
        'pty:killFenced'
      ]) {
        ipcMain.removeHandler(channel)
      }
      ipcMain.handle('memory:resourceWindowVisible', () => true)
      ipcMain.handle('memory:getSnapshot', () => {
        counts.metrics++
        return null
      })
      ipcMain.handle('pty:listSessions', (_event, scope) => {
        counts.listing++
        if (scope?.connectionId !== null) {
          return []
        }
        return rows
      })
      ipcMain.handle('pty:killFenced', (_event, request) => {
        counts.kills.push(request)
        return { outcome: 'refused', reason: 'attached' }
      })
    }, sessionCount)
    await makeResourceManagerFixtureVisible(electronApp, markovPage)
    await markovPage.evaluate(async (theme) => {
      await window.__store!.getState().updateSettingsOrThrow({ theme })
    }, theme)
    await markovPage.getByRole('button', { name: /^Resource Manager,/ }).click()
    const popover = markovPage.locator('[data-slot="popover-content"]').filter({
      has: markovPage.getByRole('tab', { name: 'Resources', exact: true })
    })
    const resourcesHeight = await popover.evaluate((element) => element.clientHeight)
    const listStarted = performance.now()
    await markovPage.getByRole('tab', { name: 'PTYs', exact: true }).click()
    await expect(
      markovPage.getByText(
        `${sessionCount} Markov PTYs on this computer · ${sessionCount} without a tab`,
        { exact: true }
      )
    ).toBeVisible()
    const listMs = performance.now() - listStarted
    const before = await electronApp.evaluate(() => {
      if (!globalThis.__ptyViewCounts) {
        throw new Error('PTY view counters missing')
      }
      return globalThis.__ptyViewCounts
    })
    const panel = markovPage.getByRole('tabpanel', { name: /^PTYs/ })
    await expect(panel.getByRole('searchbox')).toHaveCount(0)
    await expect(panel.getByRole('combobox')).toHaveCount(0)
    const body = markovPage.locator('[data-resource-pty-body]')
    await expect
      .poll(() => popover.evaluate((element) => element.clientHeight))
      .toBe(resourcesHeight)
    await expect
      .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true)
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const unsupportedEnd = panel.getByRole('button', {
      name: `End Terminal ${sessionCount - 2}`,
      exact: true
    })
    await expect(unsupportedEnd).toBeDisabled()
    await unsupportedEnd.locator('..').hover()
    await expect(markovPage.getByRole('tooltip', { name: /^End is unavailable/ })).toContainText(
      'End is unavailable for this terminal. Its host does not support the required safety checks.'
    )
    const details = panel.getByRole('button', {
      name: `Details for Terminal ${sessionCount - 1}`,
      exact: true
    })
    await details.focus()
    await markovPage.keyboard.press('Enter')
    await expect(details).toHaveAttribute('aria-expanded', 'true')
    const lastSessionId = `local-pty-${String(sessionCount - 1).padStart(4, '0')}`
    await expect(panel.locator('dl').getByText(lastSessionId, { exact: true })).toBeVisible()
    await expect(
      panel.locator('dl').getByText(`incarnation-${sessionCount - 1}`, { exact: true })
    ).toBeVisible()
    await expect(panel.locator('dl').getByText('Unavailable', { exact: true })).toHaveCount(2)
    await panel.getByRole('button', { name: 'Copy Markov session ID', exact: true }).click()
    expect(await electronApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(lastSessionId)
    await markovPage.screenshot({
      path: testInfo.outputPath(`local-pty-details-${theme}.png`),
      animations: 'disabled'
    })
    await body.evaluate((element) => {
      element.scrollTop = 0
    })
    await expect(panel.getByRole('button', { name: 'End Terminal 0', exact: true })).toBeVisible()
    const firstTerminal = markovPage.getByRole('button', { name: 'End Terminal 0', exact: true })
    await expect(firstTerminal).toBeVisible()
    expect(await markovPage.getByRole('button', { name: /^End Terminal/ }).count()).toBeLessThan(50)
    await firstTerminal.focus()
    for (let index = 1; index <= Math.min(30, sessionCount - 3); index++) {
      await markovPage.keyboard.press('Tab')
      await expect(
        body.getByRole('checkbox', { name: `Select Terminal ${index}`, exact: true })
      ).toBeFocused()
      await markovPage.keyboard.press('Tab')
      await markovPage.keyboard.press('Tab')
      const terminal = markovPage.getByRole('button', {
        name: `End Terminal ${index}`,
        exact: true
      })
      await expect(terminal).toBeFocused()
      await expect(terminal).toBeInViewport()
    }
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    const lastTerminal = body.getByRole('button', {
      name: `End Terminal ${sessionCount - 1}`,
      exact: true
    })
    await expect(lastTerminal).toBeInViewport()
    console.info(JSON.stringify({ theme, rows: sessionCount, listMs }))
    await expect(
      body.getByText(`Last seen process: node · /workspace/folder-${sessionCount - 1}`, {
        exact: true
      })
    ).toBeVisible()
    const after = await electronApp.evaluate(() => {
      if (!globalThis.__ptyViewCounts) {
        throw new Error('PTY view counters missing')
      }
      return globalThis.__ptyViewCounts
    })
    expect(after.listing).toBe(before.listing)
    expect(after.metrics).toBe(before.metrics)
    await lastTerminal.click()
    await expect(
      markovPage.getByRole('dialog', { name: `End Terminal ${sessionCount - 1}?` })
    ).toHaveCount(0)
    await expect(
      markovPage.getByText(
        'A client is now attached to this terminal. Refresh before trying again.',
        { exact: true }
      )
    ).toBeVisible()
    expect(
      (
        await electronApp.evaluate(() => {
          if (!globalThis.__ptyViewCounts) {
            throw new Error('PTY view counters missing')
          }
          return globalThis.__ptyViewCounts
        })
      ).kills
    ).toEqual([
      {
        id: lastSessionId,
        expectedIncarnationId: `incarnation-${sessionCount - 1}`,
        requireNoAgentOwner: true,
        requireUnattached: true
      }
    ])
    await body
      .getByRole('checkbox', {
        name: `Select Terminal ${sessionCount - 1}`,
        exact: true
      })
      .check()
    await body.evaluate((element) => {
      element.scrollTop = 0
    })
    await body.getByRole('checkbox', { name: 'Select Terminal 0', exact: true }).check()
    await markovPage.screenshot({
      path: testInfo.outputPath(`local-ptys-selected-${theme}.png`),
      animations: 'disabled'
    })
    await panel.getByRole('button', { name: 'End selected (2)', exact: true }).click()
    await expect(
      panel.getByRole('button', { name: 'End selected (0)', exact: true })
    ).toBeDisabled()
    await expect(markovPage.getByRole('dialog', { name: /^End / })).toHaveCount(0)
    await expect
      .poll(() => electronApp.evaluate(() => globalThis.__ptyViewCounts?.kills?.length))
      .toBe(3)
    await markovPage.screenshot({
      path: testInfo.outputPath(`local-ptys-${theme}.png`),
      animations: 'disabled'
    })
    await testInfo.attach(`local-ptys-${theme}`, {
      path: testInfo.outputPath(`local-ptys-${theme}.png`),
      contentType: 'image/png'
    })
    await testInfo.attach('interaction-measurement', {
      body: JSON.stringify({
        rows: sessionCount,
        listingCalls: before.listing,
        metricCalls: before.metrics
      }),
      contentType: 'application/json'
    })
  })
}
