import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MARKOVD_WINDOWS_BREAKAWAY_CONTRACT } from './windows-breakaway-launch'
import {
  keepPreviousStderrLog,
  parseWindowsBreakawayLaunchRequest
} from './windows-breakaway-launcher'

let dir: string | undefined
function makeDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'markov-breakaway-log-'))
  return dir
}
afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = undefined
  }
})

describe('keeping the previous markovd.log on Windows', () => {
  it('parses the opt-in flag without taking the next flag as its value', () => {
    const request = parseWindowsBreakawayLaunchRequest(MARKOVD_WINDOWS_BREAKAWAY_CONTRACT, [
      'node.exe',
      'markovd.js',
      '--windows-breakaway-launch',
      '--stdout-file',
      'C:/slot/.markovd-readiness',
      '--stderr-file',
      'C:/slot/markovd.log',
      '--stderr-keep-previous',
      '--process-file',
      'C:/slot/.markovd-process.json',
      '--markovd-args',
      '--json'
    ])
    expect(request).toMatchObject({
      stderrPath: 'C:/slot/markovd.log',
      processFilePath: 'C:/slot/.markovd-process.json',
      keepPreviousStderr: true
    })
  })

  it('moves the last run log to .1, replacing an older one', () => {
    const log = join(makeDir(), 'markovd.log')
    writeFileSync(`${log}.1`, 'two runs ago')
    writeFileSync(log, 'crash: listen EADDRINUSE')
    keepPreviousStderrLog(log)
    expect(readFileSync(`${log}.1`, 'utf8')).toBe('crash: listen EADDRINUSE')
    expect(existsSync(log)).toBe(false)
  })

  it('keeps only the tail of an oversized log', () => {
    const log = join(makeDir(), 'markovd.log')
    writeFileSync(log, `${'x'.repeat(100)}last error`)
    keepPreviousStderrLog(log, 10)
    expect(readFileSync(`${log}.1`, 'utf8')).toBe('last error')
  })

  it('does nothing when there is no previous log', () => {
    const log = join(makeDir(), 'markovd.log')
    expect(() => keepPreviousStderrLog(log)).not.toThrow()
    expect(existsSync(`${log}.1`)).toBe(false)
  })
})
