import type { Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './helpers/markov-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { readPaneIdentitySnapshot } from './helpers/terminal'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/markov-restart'
import {
  addRepoWithWorkspaces,
  linkWorkspaces,
  writeWorkspaceMeta
} from './helpers/repo-with-workspaces'
import { dismissSetupScriptPrompts } from './helpers/sidebar-setup-prompt'
import { seedLineageScenario } from './worktree-lineage-state'

test.use({ launchEnv: { MARKOV_BACKGROUND_LAUNCH: '1' } })

const ACTION_ID = 'sidebar.childWorkspaces.toggle' as const
const CHORD = 'ControlOrMeta+Alt+KeyH'

function sidebarWorktreeRow(page: Page, worktreeId: string) {
  return page
    .locator(
      `[data-worktree-sidebar] [role="option"][data-worktree-id=${JSON.stringify(worktreeId)}]`
    )
    .first()
}

async function waitForLineageWorktrees(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const store = window.__store
          if (!store) {
            return 0
          }
          for (const repo of store.getState().repos) {
            await store.getState().fetchWorktrees(repo.id)
          }
          return Object.values(store.getState().worktreesByRepo)
            .flat()
            .filter((worktree) => !worktree.isArchived).length
        }),
      { timeout: 30_000 }
    )
    .toBeGreaterThanOrEqual(2)
}

async function captureEvidence(page: Page, name: string): Promise<void> {
  if (process.env.MARKOV_CAPTURE_EVIDENCE !== '1') {
    return
  }
  const directory = join(process.cwd(), 'pr-evidence')
  mkdirSync(directory, { recursive: true })
  await page.screenshot({ path: join(directory, name) })
}

async function setToggleBinding(page: Page, bindings: string[] | null): Promise<void> {
  await page.evaluate(
    async ({ actionId, bindings }) => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      const state = store.getState()
      await (bindings
        ? state.setKeybindingOverride(actionId, bindings)
        : state.resetKeybindingOverride(actionId))
    },
    { actionId: ACTION_ID, bindings }
  )
}

async function movePointerOffSidebar(page: Page): Promise<void> {
  const viewport =
    page.viewportSize() ??
    (await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    })))
  await page.mouse.move(viewport.width - 20, viewport.height / 2)
}

async function observeShortcutClaim(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyH') {
        document.body.dataset.childToggleClaimed = String(event.defaultPrevented)
      }
    })
  })
}

test.describe('Toggle Child Workspaces shortcut', () => {
  test.beforeEach(async ({ markovPage, electronApp }) => {
    await waitForSessionReady(markovPage)
    await waitForActiveWorktree(markovPage)
    expect(
      await electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().every((window) => !window.isVisible())
      )
    ).toBe(true)
  })

  test.afterEach(async ({ markovPage }) => {
    await setToggleBinding(markovPage, null)
  })

  test('hides and shows children of the active or hovered workspace', async ({ markovPage }) => {
    const { parentId, childId } = await seedLineageScenario(markovPage)
    await setToggleBinding(markovPage, ['Mod+Alt+H'])
    const parentRow = sidebarWorktreeRow(markovPage, parentId)
    const childRow = sidebarWorktreeRow(markovPage, childId)

    await parentRow.click()
    await expect(parentRow).toHaveAttribute('aria-current', 'page')
    await expect(childRow).toBeVisible()
    await captureEvidence(markovPage, 'child-toggle-sidebar-expanded.png')

    // No hovered card: the active parent is the target.
    await movePointerOffSidebar(markovPage)
    await markovPage.keyboard.press(CHORD)
    await expect(childRow).toBeHidden()
    await expect(parentRow.getByRole('button', { name: 'Show 1 child workspace' })).toBeVisible()
    await captureEvidence(markovPage, 'child-toggle-sidebar-collapsed.png')

    await markovPage.keyboard.press(CHORD)
    await expect(childRow).toBeVisible()
    await expect(parentRow.getByRole('button', { name: 'Hide 1 child workspace' })).toBeVisible()

    await childRow.click()
    await expect(childRow).toHaveAttribute('aria-current', 'page')
    await movePointerOffSidebar(markovPage)
    await markovPage.keyboard.press(CHORD)
    await expect(childRow).toBeHidden()
    await markovPage.keyboard.press(CHORD)
    await expect(childRow).toBeVisible()
    await parentRow.click()

    // A hovered leaf child folds its parent.
    await childRow.hover()
    await markovPage.keyboard.press(CHORD)
    await expect(childRow).toBeHidden()
    await expect(parentRow.getByRole('button', { name: 'Show 1 child workspace' })).toBeVisible()

    // A hovered parent unfolds its own children.
    await parentRow.hover()
    await markovPage.keyboard.press(CHORD)
    await expect(childRow).toBeVisible()
  })

  test('a modal keeps its shortcut input while the parent chip is visible', async ({
    markovPage
  }) => {
    const { parentId, childId } = await seedLineageScenario(markovPage)
    await setToggleBinding(markovPage, ['Mod+Alt+H'])
    await markovPage.evaluate(() => window.__store?.getState().openModal('worktree-palette'))
    await expect(markovPage.getByRole('dialog')).toBeVisible()
    await markovPage.getByRole('dialog').evaluate((dialog) => {
      dialog.setAttribute('tabindex', '-1')
      dialog.focus()
    })
    await markovPage.keyboard.press(CHORD)
    await expect(
      sidebarWorktreeRow(markovPage, parentId).getByRole('button', {
        name: 'Hide 1 child workspace',
        includeHidden: true
      })
    ).toBeVisible()
    await expect(sidebarWorktreeRow(markovPage, childId)).toBeVisible()
    await markovPage.keyboard.press('Escape')
  })

  test('a hovered parent takes precedence over another active family', async ({
    markovPage
  }, testInfo) => {
    const { childId } = await seedLineageScenario(markovPage)
    await setToggleBinding(markovPage, ['Mod+Alt+H'])
    const otherRepo = await addRepoWithWorkspaces(markovPage, testInfo, 2)
    const other = { parentId: otherRepo.ids[0]!, childId: otherRepo.ids[1]! }
    await writeWorkspaceMeta(markovPage, [
      { worktreeId: other.parentId, updates: { displayName: 'Another parent' } },
      { worktreeId: other.childId, updates: { displayName: 'Another child' } }
    ])
    await linkWorkspaces(markovPage, [other])
    await expect(sidebarWorktreeRow(markovPage, other.childId)).toBeVisible()
    await sidebarWorktreeRow(markovPage, other.parentId).hover()
    await markovPage.keyboard.press(CHORD)
    await expect(sidebarWorktreeRow(markovPage, other.childId)).toBeHidden()
    await expect(sidebarWorktreeRow(markovPage, childId)).toBeVisible()
    await captureEvidence(markovPage, 'child-toggle-hover-precedence.png')
  })

  test('a focused floating workspace keeps the shortcut input', async ({ markovPage }) => {
    const { parentId, childId } = await seedLineageScenario(markovPage)
    await setToggleBinding(markovPage, ['Mod+Alt+H'])
    await markovPage.getByRole('button', { name: 'Show floating workspace', exact: true }).click()
    const panel = markovPage.locator('[data-floating-terminal-panel][aria-hidden="false"]')
    await expect(panel).toBeVisible()
    await panel.locator('[data-floating-terminal-shortcut-surface]').first().focus()
    await markovPage.keyboard.press(CHORD)
    await expect(
      sidebarWorktreeRow(markovPage, parentId).getByRole('button', {
        name: 'Hide 1 child workspace'
      })
    ).toBeVisible()
    await expect(sidebarWorktreeRow(markovPage, childId)).toBeVisible()
    await captureEvidence(markovPage, 'child-toggle-floating-guard.png')
  })

  test('folder cards pass the chord through while another family has a chip', async ({
    markovPage
  }) => {
    const { parentId, childId } = await seedLineageScenario(markovPage)
    await setToggleBinding(markovPage, ['Mod+Alt+H'])
    const folderKey = await markovPage.evaluate(async () => {
      const store = window.__store
      const repo = store?.getState().repos[0]
      if (!store || !repo) {
        throw new Error('Missing seeded project')
      }
      const group = await window.api.projectGroups.create({
        name: 'Folder project',
        parentPath: repo.path,
        createdFrom: 'manual'
      })
      await store.getState().fetchProjectGroups({ runtimeEnvironmentId: null, throwOnError: true })
      const folder = await store.getState().createFolderWorkspace(
        {
          projectGroupId: group.id,
          name: 'Folder without a child chip',
          folderPath: repo.path
        },
        { runtimeEnvironmentId: null }
      )
      if (!folder) {
        throw new Error('Missing created folder workspace')
      }
      return `folder:${folder.id}`
    })
    const folder = sidebarWorktreeRow(markovPage, folderKey)
    await expect(folder).toBeVisible()
    await expect(folder.getByRole('button', { name: /child workspace/ })).toHaveCount(0)
    await dismissSetupScriptPrompts(markovPage)
    await sidebarWorktreeRow(markovPage, parentId).click()
    await markovPage.locator('[data-worktree-sidebar]').focus()
    await folder.hover()
    await observeShortcutClaim(markovPage)
    await markovPage.keyboard.press(CHORD)
    await expect(markovPage.locator('body')).toHaveAttribute('data-child-toggle-claimed', 'false')
    await expect(sidebarWorktreeRow(markovPage, childId)).toBeVisible()
    await folder.click()
    await expect(folder).toHaveAttribute('aria-current', 'page')
    await markovPage.locator('[data-worktree-sidebar]').focus()
    await movePointerOffSidebar(markovPage)
    await markovPage.keyboard.press(CHORD)
    await expect(markovPage.locator('body')).toHaveAttribute('data-child-toggle-claimed', 'false')
    await expect(sidebarWorktreeRow(markovPage, childId)).toBeVisible()
    await expect
      .poll(async () => {
        if ((await markovPage.locator('[data-terminal-error-toast]').count()) > 0) {
          return 'error'
        }
        const snapshot = await readPaneIdentitySnapshot(markovPage)
        if (!snapshot) {
          return 'pending'
        }
        const folderOwnsTab = await markovPage.evaluate(
          ({ folderKey, tabId }) => {
            const state = window.__store?.getState()
            return (
              state?.activeWorktreeId === folderKey &&
              (state.tabsByWorktree[folderKey] ?? []).some((tab) => tab.id === tabId)
            )
          },
          { folderKey, tabId: snapshot.tabId }
        )
        return folderOwnsTab &&
          snapshot.panes.some(
            (pane) => pane.ptyId !== null && snapshot.ptyIdsByLeafId[pane.leafId] === pane.ptyId
          )
          ? 'ready'
          : 'pending'
      })
      .not.toBe('pending')
    await expect(markovPage.locator('[data-terminal-error-toast]')).toHaveCount(0)
    await captureEvidence(markovPage, 'child-toggle-folder-pass-through.png')
  })
})

test('child-workspace shortcut and chip collapse survive an app restart', async ({
  testRepoPath
}, testInfo) => {
  const session = createRestartSession(testInfo)
  let app: Awaited<ReturnType<typeof session.launch>>['app'] | undefined
  try {
    const first = await session.launch()
    app = first.app
    await attachRepoAndOpenTerminal(first.page, testRepoPath)
    await waitForLineageWorktrees(first.page)
    const family = await seedLineageScenario(first.page)
    await setToggleBinding(first.page, ['Mod+Alt+H'])
    await sidebarWorktreeRow(first.page, family.parentId).click()
    await movePointerOffSidebar(first.page)
    await first.page.keyboard.press(CHORD)
    await expect(sidebarWorktreeRow(first.page, family.childId)).toBeHidden()
    await session.close(app)
    app = undefined

    const second = await session.launch()
    app = second.app
    await attachRepoAndOpenTerminal(second.page, testRepoPath)
    await waitForLineageWorktrees(second.page)
    // Resetting the grouping mode also clears the persisted collapsed groups.
    await seedLineageScenario(second.page, { preserveGrouping: true })
    await expect(
      sidebarWorktreeRow(second.page, family.parentId).getByRole('button', {
        name: 'Show 1 child workspace'
      })
    ).toBeVisible()
    await expect(sidebarWorktreeRow(second.page, family.childId)).toBeHidden()
    await movePointerOffSidebar(second.page)
    await second.page.keyboard.press(CHORD)
    await expect(sidebarWorktreeRow(second.page, family.childId)).toBeVisible()
    await captureEvidence(second.page, 'child-toggle-restart-persistence.png')
  } finally {
    if (app) {
      await session.close(app)
    }
    await session.dispose()
  }
})
