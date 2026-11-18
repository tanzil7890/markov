import { runProcess } from '@markov/process-host'

/** `<binary> --version`, or null when it does not run cleanly. */
export async function readCliVersion(binaryPath: string): Promise<string | null> {
  const result = await runProcess({ program: binaryPath, args: ['--version'], timeoutMs: 30_000 })
  return result.code === 0 ? result.stdout.trim() || null : null
}
