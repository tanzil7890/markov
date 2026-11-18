import { createHash, randomUUID } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, open, rename, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@markov/process-host'
import { CODEX_COMMAND_HELPER } from '../codex-cli/whole-codex-command'
import { getMainHttpClient } from '../network/http-client'
import { readCliVersion } from './cli-version-probe'

const CODEX_LATEST_RELEASE_URL = 'https://api.github.com/repos/openai/codex/releases/latest'

type CodexReleaseAsset = { name: string; size: number; digest: string; url: string }

/** The target triple OpenAI publishes a standalone Codex binary for, or null where it has none. */
export function codexReleaseTarget(platform: NodeJS.Platform, arch: string): string | null {
  const cpu = arch === 'arm64' ? 'aarch64' : arch === 'x64' ? 'x86_64' : null
  if (!cpu) {
    return null
  }
  if (platform === 'darwin') {
    return `${cpu}-apple-darwin`
  }
  // musl builds are static, so they also run on glibc distributions.
  return platform === 'linux' ? `${cpu}-unknown-linux-musl` : null
}

function readAsset(value: unknown): CodexReleaseAsset | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('name' in value) ||
    !('size' in value) ||
    !('digest' in value) ||
    !('browser_download_url' in value)
  ) {
    return null
  }
  const { name, size, digest, browser_download_url: url } = value
  return typeof name === 'string' &&
    typeof size === 'number' &&
    typeof digest === 'string' &&
    typeof url === 'string'
    ? { name, size, digest, url }
    : null
}

/** `codex` and, from the releases that publish one, the helper it runs every command through. */
async function findCodexAssets(
  target: string,
  signal: AbortSignal
): Promise<{ codex: CodexReleaseAsset; helper: CodexReleaseAsset | null }> {
  const response = await getMainHttpClient().fetch(CODEX_LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    signal
  })
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} when asked for the latest Codex release.`)
  }
  const release: unknown = await response.json()
  const assets =
    typeof release === 'object' &&
    release !== null &&
    'assets' in release &&
    Array.isArray(release.assets)
      ? release.assets
      : []
  const published = assets.map(readAsset)
  const name = `codex-${target}.tar.gz`
  const codex = published.find((candidate) => candidate?.name === name)
  if (!codex) {
    throw new Error(`The latest Codex release has no ${name}.`)
  }
  const helperName = `${CODEX_COMMAND_HELPER}-${target}.tar.gz`
  return { codex, helper: published.find((candidate) => candidate?.name === helperName) ?? null }
}

async function downloadVerified(
  asset: CodexReleaseAsset,
  destination: string,
  onPercent: (percent: number) => void,
  signal: AbortSignal
): Promise<void> {
  const expected = asset.digest.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : ''
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('The Codex release has no SHA-256 checksum, so Markov will not install it.')
  }
  const response = await getMainHttpClient().fetch(asset.url, { signal })
  if (!response.ok || !response.body) {
    throw new Error(`The Codex download failed with HTTP ${response.status}.`)
  }
  const hash = createHash('sha256')
  let received = 0
  let reported = -1
  // The fetch signal also aborts reader.read(), so cancelling stops the download mid-stream.
  const reader = response.body.getReader()
  const file = await open(destination, 'w')
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      hash.update(value)
      await file.write(value)
      received += value.byteLength
      const percent = asset.size > 0 ? Math.min(100, Math.floor((received * 100) / asset.size)) : 0
      if (percent !== reported) {
        reported = percent
        onPercent(percent)
      }
    }
  } finally {
    await file.close()
  }
  if (hash.digest('hex') !== expected) {
    throw new Error('The Codex download did not match its published checksum.')
  }
}

async function unpack(archive: string, workDir: string, signal: AbortSignal): Promise<void> {
  const extracted = await runProcess({
    program: 'tar',
    args: ['-xzf', archive, '-C', workDir],
    timeoutMs: 120_000,
    signal
  })
  if (extracted.code !== 0) {
    throw new Error(
      `Could not unpack Codex: ${extracted.stderr.trim() || `tar exited ${extracted.code}`}`
    )
  }
}

/** Stage beside the target so the final rename is atomic and never leaves a half-written program. */
async function installProgram(unpacked: string, binDir: string, name: string): Promise<string> {
  const staged = join(binDir, `.${name}-${randomUUID()}.tmp`)
  await copyFile(unpacked, staged)
  await chmod(staged, 0o755)
  const installed = join(binDir, name)
  try {
    await rename(staged, installed)
  } catch (error) {
    await rm(staged, { force: true })
    throw error
  }
  return installed
}

/** Installs OpenAI's published standalone Codex as ~/.local/bin/codex, with its command helper
 *  beside it, after checking each download's digest. */
export async function installCodexFromRelease(
  target: string,
  onProgress: (stage: 'downloading' | 'installing', percent: number | null) => void,
  signal: AbortSignal
): Promise<string | null> {
  const { codex, helper } = await findCodexAssets(target, signal)
  const workDir = await mkdtemp(join(tmpdir(), 'markov-codex-install-'))
  try {
    // One bar for both downloads, each weighed by its size.
    const total = codex.size + (helper?.size ?? 0)
    const share = (asset: CodexReleaseAsset, before: number) => (percent: number) =>
      onProgress(
        'downloading',
        total > 0 ? Math.floor((before + (asset.size * percent) / 100) * (100 / total)) : percent
      )
    const archive = join(workDir, codex.name)
    await downloadVerified(codex, archive, share(codex, 0), signal)
    const helperArchive = helper ? join(workDir, helper.name) : null
    if (helper && helperArchive) {
      await downloadVerified(helper, helperArchive, share(helper, codex.size), signal)
    }
    onProgress('installing', null)
    await unpack(archive, workDir, signal)
    if (helperArchive) {
      await unpack(helperArchive, workDir, signal)
    }
    const binDir = join(homedir(), '.local', 'bin')
    await mkdir(binDir, { recursive: true })
    if (helperArchive) {
      // Why first: a codex in place without its helper can run no command.
      await installProgram(
        join(workDir, `${CODEX_COMMAND_HELPER}-${target}`),
        binDir,
        CODEX_COMMAND_HELPER
      )
    }
    const installed = await installProgram(join(workDir, `codex-${target}`), binDir, 'codex')
    return await readCliVersion(installed)
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
