import { describe, expect, it } from 'vitest'
import { parseMarkovBrowserCommand } from './markov-browser-cli-commands'

describe('parseMarkovBrowserCommand', () => {
  it.each([
    ['markov click --element e3', null],
    ['markov snapshot --page p1', 'p1'],
    ['markov-dev fill --element e2 --text hi --page=p2', 'p2'],
    ["markov goto --url https://example.com --page='p3'", 'p3'],
    ['/Users/me/.local/bin/markov screenshot', null],
    ['C:\\Users\\me\\markov\\markov.cmd tab create', null],
    ['markov-ide mouse move --x 1 --y 2', null],
    ['cd app && markov click --element e3 --page p4', 'p4'],
    ['git status; MARKOV_DEBUG=1 markov tab list', null],
    ['markov snapshot | head -20', null],
    ['markov browser identity get', null]
  ])('matches %s', (command, pageId) => {
    expect(parseMarkovBrowserCommand(command)).toEqual({ pageId })
  })

  it.each([
    'markov worktree ls',
    'markov terminal send --text "markov click"',
    'markovstra click',
    'markov',
    'echo markov click',
    'echo "docs; markov snapshot --page p1; text"',
    "git commit -m 'run markov click | markov snapshot'",
    'git log --oneline'
  ])('does not match %s', (command) => {
    expect(parseMarkovBrowserCommand(command)).toBeNull()
  })
})
