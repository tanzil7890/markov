import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { markovdDataRootIsOnLocalDisk } from './markovd-data-root-locality'

describe('markovdDataRootIsOnLocalDisk', () => {
  it.runIf(process.platform === 'linux' || process.platform === 'darwin')(
    'recognises a local temp directory, and refuses a path it cannot inspect',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'markovd-locality-'))
      try {
        expect(markovdDataRootIsOnLocalDisk(root)).toBe(true)
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
      expect(markovdDataRootIsOnLocalDisk(join(root, 'missing'))).toBe(false)
    }
  )

  it('treats a Windows UNC data root as reachable from other machines', () => {
    expect(markovdDataRootIsOnLocalDisk('\\\\filer\\home\\markov', 'win32')).toBe(false)
    expect(markovdDataRootIsOnLocalDisk('\\\\?\\UNC\\filer\\home\\markov', 'win32')).toBe(false)
    expect(markovdDataRootIsOnLocalDisk('C:\\Users\\u\\AppData\\Roaming\\markov', 'win32')).toBe(
      true
    )
    expect(markovdDataRootIsOnLocalDisk('\\\\?\\C:\\Users\\u\\markov', 'win32')).toBe(true)
  })
})
