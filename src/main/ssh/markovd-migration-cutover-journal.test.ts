import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { markovdMigrationCutoverFixture as cutover } from './markovd-migration-cutover-fixture'
import {
  findMarkovdMigrationSourceCutoverForTarget,
  listMarkovdMigrationSourceCutovers,
  markovdMigrationCutoverJournalDirectory,
  removeMarkovdMigrationSourceCutover,
  writeMarkovdMigrationSourceCutover
} from './markovd-migration-cutover-journal'

let userDataPath: string
beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'markovd-cutover-journal-'))
})
afterEach(() => rmSync(userDataPath, { recursive: true, force: true }))

const journalPath = (id: string) =>
  join(markovdMigrationCutoverJournalDirectory(userDataPath), `${id}.json`)

describe('migration cutover journal sidecar', () => {
  it('round-trips a cutover in an owner-only file', () => {
    writeMarkovdMigrationSourceCutover(userDataPath, cutover())
    expect(findMarkovdMigrationSourceCutoverForTarget(userDataPath, 'ssh-1')).toEqual(cutover())
    if (process.platform !== 'win32') {
      expect(statSync(journalPath('migration-1')).mode & 0o077).toBe(0)
    }
    removeMarkovdMigrationSourceCutover(userDataPath, 'migration-1')
    expect(listMarkovdMigrationSourceCutovers(userDataPath)).toEqual([])
  })

  it.each([
    ['corrupt JSON', '{not json'],
    ['a manifest bound to another target', JSON.stringify({ ...cutover(), sshTargetId: 'ssh-2' })],
    ['a tampered manifest', JSON.stringify({ ...cutover(), manifestSha256: 'f'.repeat(64) })],
    ['an unknown version', JSON.stringify({ ...cutover(), version: 2 })]
  ])('fails closed on %s', (_label, contents) => {
    mkdirSync(markovdMigrationCutoverJournalDirectory(userDataPath), { recursive: true })
    writeFileSync(journalPath('migration-1'), contents)
    expect(() => listMarkovdMigrationSourceCutovers(userDataPath)).toThrow('stays fenced')
  })

  it("reads a newer build's journal that adds an optional field", () => {
    mkdirSync(markovdMigrationCutoverJournalDirectory(userDataPath), { recursive: true })
    writeFileSync(journalPath('migration-1'), JSON.stringify({ ...cutover(), addedLater: true }))
    expect(listMarkovdMigrationSourceCutovers(userDataPath)).toEqual([cutover()])
  })

  it('serves repeat reads from cache yet sees a file rewritten behind its back', () => {
    writeMarkovdMigrationSourceCutover(userDataPath, cutover())
    const first = listMarkovdMigrationSourceCutovers(userDataPath)
    expect(listMarkovdMigrationSourceCutovers(userDataPath)[0]).toBe(first[0])
    writeFileSync(
      journalPath('migration-1'),
      JSON.stringify({ ...cutover(), phase: 'destination-staged' })
    )
    expect(listMarkovdMigrationSourceCutovers(userDataPath)[0]?.phase).toBe('destination-staged')
  })

  it('fails closed on a file whose name disagrees with its migration', () => {
    mkdirSync(markovdMigrationCutoverJournalDirectory(userDataPath), { recursive: true })
    writeFileSync(journalPath('other'), JSON.stringify(cutover()))
    expect(() => listMarkovdMigrationSourceCutovers(userDataPath)).toThrow('stays fenced')
  })

  it('ignores durable-write temporaries but refuses two journals for one target', () => {
    writeMarkovdMigrationSourceCutover(userDataPath, cutover())
    writeFileSync(join(markovdMigrationCutoverJournalDirectory(userDataPath), 'x.json.tmp'), '?')
    expect(listMarkovdMigrationSourceCutovers(userDataPath)).toHaveLength(1)
    writeMarkovdMigrationSourceCutover(userDataPath, cutover('migration-2'))
    expect(() => findMarkovdMigrationSourceCutoverForTarget(userDataPath, 'ssh-1')).toThrow(
      'journals name SSH target'
    )
  })

  it('bounds concurrent migrations but rewrites an existing one', () => {
    for (const index of [1, 2, 3, 4]) {
      writeMarkovdMigrationSourceCutover(userDataPath, cutover(`m-${index}`, `ssh-${index}`))
    }
    expect(() => writeMarkovdMigrationSourceCutover(userDataPath, cutover('m-5', 'ssh-5'))).toThrow(
      'capacity'
    )
    writeMarkovdMigrationSourceCutover(userDataPath, {
      ...cutover('m-1', 'ssh-1'),
      phase: 'destination-staged'
    })
    expect(findMarkovdMigrationSourceCutoverForTarget(userDataPath, 'ssh-1')?.phase).toBe(
      'destination-staged'
    )
  })
})
