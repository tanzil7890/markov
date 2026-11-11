import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const REPO_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'list'],
    summary: 'List repos registered in Markov',
    usage: 'markov repo list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['repo', 'add'],
    summary: 'Add a project to Markov by filesystem path',
    usage: 'markov repo add --path <path> [--kind git|folder] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'kind'],
    notes: [
      'Defaults to git. Use --kind folder for an ordinary directory, including a parent of separate Git repositories; folder workspaces have no Git worktrees or source control.',
      'With --environment, --path must be an absolute path on that Markov server.'
    ],
    examples: ['markov repo add --path /abs/path/to/folder --kind folder --json']
  },
  {
    path: ['repo', 'show'],
    summary: 'Show one registered repo',
    usage: 'markov repo show --repo <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo']
  },
  {
    path: ['repo', 'set'],
    summary: 'Set whether non-Markov worktrees are shown for a repo',
    usage:
      'markov repo set --repo <selector> --external-worktree-visibility show|hide|inherit [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'external-worktree-visibility'],
    notes: [
      'show and hide override the global non-Markov worktree visibility default for this repo; inherit clears the override.',
      'Per-worktree visibility rules still apply.'
    ],
    examples: [
      'markov repo set --repo path:/path/to/repo --external-worktree-visibility show --json'
    ]
  },
  {
    path: ['repo', 'set-base-ref'],
    summary: "Set the repo's default base ref for future worktrees",
    usage: 'markov repo set-base-ref --repo <selector> --ref <ref> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'ref']
  },
  {
    path: ['repo', 'search-refs'],
    summary: 'Search branch/tag refs within a repo',
    usage: 'markov repo search-refs --repo <selector> --query <text> [--limit <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'query', 'limit']
  }
]
