#!/usr/bin/env node
// Render the logo title cards (feature-wall tiles and README feature images) from resources/logo.svg.
// Rerun after any logo change. Needs Google Chrome (or CHROME_PATH) and ImageMagick's magick.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcessSync } from '@markov/process-host'
import {
  FEATURE_WALL_TILES,
  isFeatureWallMediaTile
} from '../../../../src/shared/feature-wall-tiles.ts'

const ROOT = path.resolve(import.meta.dirname, '../../../..')
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TILE_DIR = 'resources/onboarding/feature-wall'
const README_DIR = 'docs/assets/readme-features'

// README cards that show the logo; the others are recordings of the app and stay as they are.
const README_CARDS = [
  { slug: 'orchestration', title: 'Orchestrate Agents' },
  { slug: 'remote', title: 'Run Anywhere' },
  { slug: 'mobile-companion', title: 'Mobile App' },
  { slug: 'parallel-worktrees', title: 'Parallel Worktrees' },
  { slug: 'markov-cli', title: 'Markov CLI' },
  { slug: 'plugins', title: 'Plugins' }
]

const cards = [
  ...FEATURE_WALL_TILES.filter(isFeatureWallMediaTile).map((tile) => ({
    title: tile.title,
    width: 960,
    height: 540,
    outputs: [path.join(TILE_DIR, tile.posterPath), path.join(TILE_DIR, tile.gifPath)]
  })),
  ...README_CARDS.map(({ slug, title }) => ({
    title,
    width: 960,
    height: 600,
    outputs: [path.join(README_DIR, `${slug}.poster.jpg`), path.join(README_DIR, `${slug}.webp`)]
  }))
]

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function cardHtml(logo, { title, width, height }) {
  return `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
body {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background:
    radial-gradient(ellipse 58% 48% at 50% 0%, rgb(32 40 60) 0%, rgb(32 40 60 / 0) 100%),
    linear-gradient(rgb(19 22 29), rgb(12 13 17) 80%, rgb(10 11 13));
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #fff;
}
svg { width: 104px; height: 109px; }
h1 { margin: 38px 0 0; font-size: 34px; font-weight: 700; }
.word { position: absolute; left: 0; right: 0; bottom: 27px; text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 0.32em; text-indent: 0.32em; color: rgb(124 132 150); }
</style><body>${logo}<h1>${escapeHtml(title)}</h1><div class="word">MARKOV</div></body>`
}

function run(program, args) {
  const result = runProcessSync({ program, args, timeoutMs: 120_000 })
  if (result.code !== 0) {
    throw new Error(`${program} failed: ${result.stderr}`)
  }
}

const logo = (await readFile(path.join(ROOT, 'resources/logo.svg'), 'utf8')).trim()
const workDir = await mkdtemp(path.join(tmpdir(), 'markov-title-cards-'))
try {
  for (const [index, card] of cards.entries()) {
    const htmlPath = path.join(workDir, `card-${index}.html`)
    const pngPath = path.join(workDir, `card-${index}.png`)
    await writeFile(htmlPath, cardHtml(logo, card))
    run(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${path.join(workDir, 'chrome-profile')}`,
      `--window-size=${card.width},${card.height}`,
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href
    ])
    for (const output of card.outputs) {
      const target = path.join(ROOT, output)
      const format = path.extname(output)
      const options =
        format === '.jpg' ? ['-quality', '90'] : format === '.webp' ? ['-quality', '88'] : []
      run('magick', [pngPath, ...options, target])
      console.log(`  -> ${output}`)
    }
  }
} finally {
  await rm(workDir, { recursive: true, force: true })
}
