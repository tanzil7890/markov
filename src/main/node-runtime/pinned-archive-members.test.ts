import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { extractPinnedArchiveMembers } from './pinned-archive-members'

const roots: string[] = []

/** A release package as a tar.gz: two programs and a file the programs look for beside them. */
function releaseArchive(): { archive: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'pinned-archive-'))
  roots.push(root)
  const source = join(root, 'source')
  mkdirSync(join(source, 'bin'), { recursive: true })
  mkdirSync(join(source, 'resources'))
  writeFileSync(join(source, 'bin', 'agent'), 'agent program')
  writeFileSync(join(source, 'bin', 'agent-helper'), 'helper program')
  writeFileSync(join(source, 'resources', 'sandbox'), 'sandbox program')
  const archive = join(root, 'release.tar.gz')
  execFileSync('tar', ['-czf', archive, '-C', source, 'bin', 'resources'])
  return { archive, root }
}

const MEMBERS = [
  { path: 'bin/agent', sha256: '', bytes: 13 },
  { path: 'bin/agent-helper', sha256: '', bytes: 14 }
]

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('unpacking a tar.gz release', () => {
  it('takes only the pinned members unless the release needs its other files too', async () => {
    const { archive, root } = releaseArchive()
    const named = join(root, 'named')
    const whole = join(root, 'whole')
    mkdirSync(named)
    mkdirSync(whole)
    const signal = new AbortController().signal

    await extractPinnedArchiveMembers(archive, named, { members: MEMBERS }, 'Agent', signal)
    await extractPinnedArchiveMembers(
      archive,
      whole,
      { members: MEMBERS, extractWholeArchive: true },
      'Agent',
      signal
    )

    expect(readFileSync(join(named, 'bin', 'agent-helper'), 'utf8')).toBe('helper program')
    expect(existsSync(join(named, 'resources', 'sandbox'))).toBe(false)
    expect(readFileSync(join(whole, 'resources', 'sandbox'), 'utf8')).toBe('sandbox program')
  })

  it('says the archive could not be unpacked when it is not one', async () => {
    const { root } = releaseArchive()
    const broken = join(root, 'broken.tar.gz')
    writeFileSync(broken, 'not an archive')
    mkdirSync(join(root, 'out'))

    await expect(
      extractPinnedArchiveMembers(
        broken,
        join(root, 'out'),
        { members: MEMBERS },
        'Agent',
        new AbortController().signal
      )
    ).rejects.toThrow('The Agent archive could not be unpacked')
  })
})
