import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runProcess } from '@markov/process-host'
import { test as base, expect } from './helpers/markov-app'
import { openFileExplorer } from './helpers/file-explorer'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'

async function git(cwd: string, args: string[]): Promise<void> {
  const result = await runProcess({ program: 'git', args, cwd })
  if (result.code !== 0) {
    throw new Error(result.stderr)
  }
}

const test = base.extend({
  minimumSeededWorktreeCount: 1,
  seededRepoPath: async ({ testRepoPath }, provideFixture) => {
    const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'markov-sparse-proof-'))
    const sparseRepo = path.join(fixtureRoot, 'repo')
    await git(fixtureRoot, ['clone', '--local', testRepoPath, sparseRepo])
    await git(sparseRepo, ['config', 'user.email', 'sparse-proof@example.invalid'])
    await git(sparseRepo, ['config', 'user.name', 'Sparse proof'])
    for (const [name, content] of [
      ['omitted/private.txt', 'sparse-proof-marker omitted\n'],
      ['apps/web/src/App.tsx', 'export const App = () => "sparse-proof-marker Web app"\n'],
      ['apps/web/package.json', '{"name":"web-app"}\n'],
      ['packages/ui/src/Button.tsx', 'export const Button = () => "sparse-proof-marker Button"\n']
    ]) {
      const file = path.join(sparseRepo, name)
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, content)
    }
    await git(sparseRepo, ['add', '.'])
    await git(sparseRepo, ['commit', '-m', 'Sparse fixture'])
    await git(sparseRepo, ['sparse-checkout', 'init', '--cone'])
    await git(sparseRepo, ['sparse-checkout', 'set', '--', 'apps/web'])
    expect(existsSync(path.join(sparseRepo, 'omitted', 'private.txt'))).toBe(false)
    try {
      await provideFixture(sparseRepo)
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true })
    }
  }
})

test('sparse explorer defaults and outside reveal', async ({ markovPage }, testInfo) => {
  await waitForSessionReady(markovPage)
  await waitForActiveWorktree(markovPage)
  const activeWorkspace = await markovPage.evaluate(() => {
    const s = window.__store!.getState()
    const w = Object.values(s.worktreesByRepo)
      .flat()
      .find((w) => w.id === s.activeWorktreeId)!
    return { id: w.id, path: w.path, repoId: w.repoId }
  })
  const workspace = {
    ...activeWorkspace,
    appsPath: path.join(activeWorkspace.path, 'apps'),
    packagesPath: path.join(activeWorkspace.path, 'packages'),
    readmePath: path.join(activeWorkspace.path, 'README.md')
  }
  await markovPage.setViewportSize({ width: 1440, height: 960 })
  await markovPage.evaluate(
    ({ workspace }) => {
      const store = window.__store!
      const s = store.getState()
      store.setState({
        rightSidebarWidth: 430,
        explorerDisplayRootByWorktree: {},
        expandedDirs: {
          [workspace.id]: new Set([workspace.appsPath, workspace.packagesPath])
        },
        worktreesByRepo: {
          ...s.worktreesByRepo,
          [workspace.repoId]: s.worktreesByRepo[workspace.repoId].map((w) =>
            w.id === workspace.id ? { ...w, isSparse: true, sparseDirectories: ['apps/web'] } : w
          )
        }
      })
    },
    { workspace }
  )
  const board = markovPage.getByRole('button', { name: 'Workspace board', exact: true })
  await board.click()
  await board.click()
  await openFileExplorer(markovPage)
  const picker = markovPage.getByRole('button', { name: 'Explorer root', exact: true })
  await expect(picker).toContainText('apps/web')
  const rows = markovPage.locator('[data-file-explorer-row]')
  await expect(rows.filter({ hasText: 'package.json' })).toBeVisible()
  const proofDir = process.env.MARKOV_SPARSE_PROOF_DIR
  const capture = async (name: string) => {
    const file = proofDir
      ? path.resolve(proofDir, `${name}.png`)
      : testInfo.outputPath(`${name}.png`)
    mkdirSync(path.dirname(file), { recursive: true })
    await markovPage.mouse.move(700, 500)
    await expect(
      markovPage.getByRole('tooltip').filter({ hasText: 'Workspace board moved to the bottom bar' })
    ).toBeHidden({ timeout: 20000 })
    await markovPage.screenshot({ path: file, animations: 'disabled' })
    await testInfo.attach(name, { path: file, contentType: 'image/png' })
  }
  await capture('single-folder')
  await git(workspace.path, ['sparse-checkout', 'set', '--', 'apps/web', 'packages/ui'])
  await markovPage.evaluate(
    ({ workspace }) => {
      const store = window.__store!
      const s = store.getState()
      store.setState({
        explorerDisplayRootByWorktree: {},
        worktreesByRepo: {
          ...s.worktreesByRepo,
          [workspace.repoId]: s.worktreesByRepo[workspace.repoId].map((w) =>
            w.id === workspace.id
              ? { ...w, isSparse: true, sparseDirectories: ['apps/web', 'packages/ui'] }
              : w
          )
        }
      })
    },
    { workspace }
  )
  const baseline = process.env.MARKOV_SPARSE_PROOF_BASELINE === '1'
  await expect(picker).toContainText(baseline ? 'apps/web' : 'Repository root')
  if (!baseline) {
    await expect(rows.filter({ hasText: 'README.md' })).toBeVisible()
    await expect(rows.filter({ hasText: 'apps' })).toBeVisible()
    await expect(rows.filter({ hasText: 'packages' })).toBeVisible()
  }
  await capture('multiple-folders')
  await picker.click()
  await markovPage.getByRole('menuitemradio', { name: 'apps/web', exact: true }).click()
  await expect(picker).toContainText('apps/web')
  await markovPage.evaluate(
    ({ workspace }) => {
      window.__store!.getState().revealInExplorer(workspace.id, workspace.readmePath)
    },
    { workspace }
  )
  await expect(picker).toContainText(baseline ? 'Full repo root' : 'Repository root')
  await expect(rows.filter({ hasText: 'README.md' })).toBeVisible()
  await markovPage.keyboard.press('Escape')
  await capture('outside-reveal')
  if (!baseline) {
    await markovPage.getByRole('button', { name: 'Back to apps/web', exact: true }).click()
    await expect(picker).toContainText('apps/web')
    await expect(rows.filter({ hasText: 'README.md' })).toHaveCount(0)
    await capture('returned-to-folder')
    await markovPage.getByRole('button', { name: 'Repository root', exact: true }).click()
    await expect(picker).toContainText('Repository root')
    await picker.click()
    await markovPage.getByRole('menuitemradio', { name: 'apps/web', exact: true }).click()
    await expect(picker).toContainText('apps/web')
    await markovPage.getByLabel('Search file contents', { exact: true }).click()
    await expect(
      markovPage.getByText('Search scope: workspace files', { exact: true })
    ).toBeVisible()
    await expect(markovPage.getByLabel('Search file contents', { exact: true })).toHaveAttribute(
      'data-state',
      'on'
    )
    await markovPage
      .getByRole('textbox', { name: 'Search files', exact: true })
      .fill('sparse-proof-marker')
    await expect(markovPage.getByText('App.tsx', { exact: true })).toBeVisible()
    await expect(markovPage.getByText('Button.tsx', { exact: true })).toBeVisible()
    await expect(markovPage.getByText('private.txt', { exact: true })).toHaveCount(0)
    await capture('content-search')
    await markovPage.getByRole('textbox', { name: 'Search files', exact: true }).fill('')
    await markovPage.getByLabel('Filter files by name', { exact: true }).click()
    await expect(picker).toContainText('apps/web')
    await picker.click()
    await markovPage.getByRole('menuitemradio', { name: 'packages/ui', exact: true }).click()
    await expect(picker).toContainText('packages/ui')
    await expect(
      markovPage.getByRole('button', { name: 'Back to apps/web', exact: true })
    ).toHaveCount(0)
    await markovPage.evaluate(async () => {
      await window.__store!.getState().updateSettingsOrThrow({ theme: 'dark' })
    })
    await expect(markovPage.locator('html')).toHaveClass(/dark/)
    await markovPage.keyboard.press('Escape')
    await capture('saved-choice-dark')
    await markovPage.getByRole('button', { name: 'About sparse checkout scope' }).click()
    await capture('scope-details')
    await markovPage.keyboard.press('Escape')
    await markovPage.evaluate(() => window.__store!.setState({ rightSidebarWidth: 220 }))
    await capture('narrow-explorer')
    await picker.click()
    await capture('root-menu')
    await markovPage.keyboard.press('Escape')
    await markovPage.evaluate(() => window.__store!.setState({ rightSidebarWidth: 430 }))
    await git(workspace.path, ['sparse-checkout', 'disable'])
    expect(existsSync(path.join(workspace.path, 'omitted', 'private.txt'))).toBe(true)
    await markovPage.evaluate(
      ({ workspace }) => {
        const store = window.__store!
        const s = store.getState()
        store.setState({
          worktreesByRepo: {
            ...s.worktreesByRepo,
            [workspace.repoId]: s.worktreesByRepo[workspace.repoId].map((w) =>
              w.id === workspace.id ? { ...w, isSparse: false, sparseDirectories: [] } : w
            )
          }
        })
      },
      { workspace }
    )
    await expect(picker).toHaveCount(0)
    await expect(rows.filter({ hasText: 'README.md' })).toBeVisible()
    await capture('ordinary-workspace')
  }
})
