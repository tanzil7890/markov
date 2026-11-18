import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@markov/process-host'
import { getMainHttpClient } from '../network/http-client'
import { readCliVersion } from './cli-version-probe'

const CLAUDE_INSTALL_SCRIPT_URL = 'https://claude.ai/install.sh'

function lastLines(text: string, count = 4): string {
  return text.trim().split('\n').slice(-count).join('\n')
}

/**
 * Runs Anthropic's installer, which downloads the native build, checks its SHA-256 against the
 * release manifest, and installs ~/.local/bin/claude. macOS and Linux only; Windows uses a terminal.
 */
export async function installClaudeWithOfficialScript(signal: AbortSignal): Promise<string | null> {
  const response = await getMainHttpClient().fetch(CLAUDE_INSTALL_SCRIPT_URL, { signal })
  if (!response.ok) {
    throw new Error(`Downloading Claude Code's installer failed with HTTP ${response.status}.`)
  }
  const script = await response.text()
  if (!script.startsWith('#!')) {
    throw new Error("Claude Code's installer did not download correctly.")
  }
  const workDir = await mkdtemp(join(tmpdir(), 'markov-claude-install-'))
  try {
    const scriptPath = join(workDir, 'install.sh')
    await writeFile(scriptPath, script, { mode: 0o700 })
    const result = await runProcess(
      { program: '/bin/bash', args: [scriptPath], timeoutMs: 15 * 60_000, signal },
      'tail'
    )
    if (result.code !== 0) {
      throw new Error(
        lastLines(result.stderr || result.stdout) ||
          `Claude Code's installer exited with ${result.code ?? 'a signal'}.`
      )
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
  return readCliVersion(join(homedir(), '.local', 'bin', 'claude'))
}
