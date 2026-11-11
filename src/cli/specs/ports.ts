import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const PORTS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ports'],
    summary: 'List the listening ports Markov detected for a workspace',
    usage: 'markov ports [--worktree <selector>] [--all] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree', 'all'],
    notes: [
      'Defaults to the Markov workspace that contains the current directory.',
      'Scans the host the workspace runs on and lists the ports Markov tied to it, by process working directory (match=cwd) or command line (match=command).',
      '--all lists every listener found on that host, including other workspaces and processes Markov could not tie to one. A native folder workspace needs --all, because Markov does not tie ports to folders.',
      'url is the address the dev server printed in a Markov terminal; it is missing when Markov did not see one.'
    ],
    examples: [
      'markov ports',
      'markov ports --worktree branch:feature/login --json',
      'markov ports --all',
      "markov ports --json | jq -r '.result.ports[0].advertisedUrl'"
    ]
  }
]
