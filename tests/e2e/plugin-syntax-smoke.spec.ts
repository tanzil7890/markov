/**
 * Invariant: a plugin syntax highlights an already-open plain-text file without a reload,
 * re-highlights it when the grammar updates, and lets go when the plugin is disabled.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './helpers/markov-app'
import {
  disablePluginSystem,
  editorTokenClasses,
  editorTokenColor,
  enableDevPlugins,
  openRepoFile
} from './helpers/plugin-smoke'

const FILE = 'plugin-syntax-smoke.gleam'
const OTHER = 'plugin-syntax-smoke-other.txt'
// Monaco's built-in light and dark theme colors for the tokens the Gleam pack maps to.
const COMMENT = ['rgb(0, 128, 0)', 'rgb(96, 139, 78)']
const TYPE = ['rgb(0, 128, 128)', 'rgb(61, 201, 176)']
const NUMBER = ['rgb(9, 134, 88)', 'rgb(181, 206, 168)']

const colorIn = async (page: Page, text: string, palette: string[]): Promise<boolean> =>
  palette.includes((await editorTokenColor(page, text)) ?? '')

test('plugin syntax highlights live and follows updates', async ({
  markovPage,
  seededRepoPath
}) => {
  const pluginRoot = await mkdtemp(join(tmpdir(), 'markov-syntax-smoke-'))
  const grammarPath = join(pluginRoot, 'syntaxes', 'gleam.tmLanguage.json')
  try {
    await cp(join(process.cwd(), 'examples', 'plugins', 'markov-gleam-syntax'), pluginRoot, {
      recursive: true
    })
    await writeFile(join(seededRepoPath, FILE), '// a comment\npub fn main() -> Int { 42 }\n')
    await writeFile(join(seededRepoPath, OTHER), 'plain\n')
    await openRepoFile(markovPage, seededRepoPath, FILE)
    await expect.poll(() => editorTokenClasses(markovPage, 'a comment')).toHaveLength(1)

    await enableDevPlugins(markovPage, [pluginRoot])
    await expect.poll(() => editorTokenClasses(markovPage), { timeout: 15_000 }).not.toHaveLength(1)
    // Colors come from the theme rules core languages use, not one generic color.
    await expect.poll(() => colorIn(markovPage, '// a comment', COMMENT)).toBe(true)
    await expect.poll(() => colorIn(markovPage, 'Int', TYPE)).toBe(true)
    await expect.poll(() => colorIn(markovPage, '42', NUMBER)).toBe(true)

    // Switching away and back reuses the kept model; it must come back highlighted.
    await openRepoFile(markovPage, seededRepoPath, OTHER)
    await expect.poll(() => colorIn(markovPage, 'plain', COMMENT)).toBe(false)
    await openRepoFile(markovPage, seededRepoPath, FILE)
    await expect
      .poll(() => colorIn(markovPage, '// a comment', COMMENT), { timeout: 15_000 })
      .toBe(true)
    const commentBefore = await editorTokenClasses(markovPage, 'a comment')

    // An update that colors comments like keywords re-highlights the open file in place.
    const grammar = await readFile(grammarPath, 'utf8')
    await writeFile(grammarPath, grammar.replaceAll('comment.line.gleam', 'keyword.control.gleam'))
    await markovPage.evaluate(() => window.api.plugins.refresh())
    await expect
      .poll(() => editorTokenClasses(markovPage, 'a comment'), { timeout: 15_000 })
      .not.toEqual(commentBefore)

    await disablePluginSystem(markovPage)
    await expect.poll(() => editorTokenClasses(markovPage), { timeout: 15_000 }).toHaveLength(1)
  } finally {
    await disablePluginSystem(markovPage).catch(() => undefined)
    await rm(join(seededRepoPath, FILE), { force: true })
    await rm(join(seededRepoPath, OTHER), { force: true })
    await rm(pluginRoot, { recursive: true, force: true })
  }
})
