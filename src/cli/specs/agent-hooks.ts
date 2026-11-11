import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'prepare-codex'],
    summary: "Prepare a WSL pane's Markov-managed Codex home before a shell launch",
    usage: 'markov agent hooks prepare-codex',
    allowedFlags: [...LOCAL_COMMAND_FLAGS]
  },
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Markov-managed agent status hooks are enabled',
    usage: 'markov agent hooks status [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    examples: ['markov agent hooks status', 'markov agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Markov-managed agent status hooks and remove local hook entries',
    usage: 'markov agent hooks off [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    examples: ['markov agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Markov-managed agent status hooks',
    usage: 'markov agent hooks on [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    examples: ['markov agent hooks on']
  }
]
