import { LOCAL_COMMAND_FLAGS, type CommandSpec } from '../args'

// Terminal login lets headless hosts manage accounts without the desktop login UI.
export const ACCOUNT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account', 'add'],
    summary: 'Add a managed agent account by signing in on this Markov host',
    usage:
      'markov account add [--agent claude|codex|opencode|devin] [--label <name>] [--integration <id>] [--method <id>] [--answer <key=value>]... [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'agent', 'label', 'integration', 'method', 'answer'],
    repeatableFlags: ['answer'],
    notes: [
      'Runs the agent login (`claude login` / `codex login`) in this terminal, then registers the account with the local Markov runtime.',
      'Codex uses device authorization so the browser can complete sign-in from a different machine.',
      'OpenCode 2 uses `opencode auth login --standalone` in private XDG directories. Devin uses `devin auth login --force-manual-token-flow`.',
      'Use --integration <id> to skip the OpenCode integration picker; --label names the saved OpenCode or Devin profile.',
      'Use --method <id> and repeated --answer <key=value> to pass OpenCode its login method and form answers, so sign-in can finish without an interactive terminal.',
      'Antigravity accounts are saved from the current `agy` login in Markov Settings > AI Provider Accounts.',
      'OpenCode and Devin profiles apply to new explicit host agent launches. Direct SSH relay and Windows-hosted WSL selection are not supported; run the command on a headless Markov runtime on that host.',
      'Sign in with the account you want to add (e.g. use a private/incognito browser window for a second account).',
      '--agent defaults to claude. Requires the Markov runtime to be running on this machine.'
    ],
    examples: [
      'markov account add',
      'markov account add --agent codex',
      'markov account add --agent opencode --integration github-copilot --method <id> --answer <key=value>'
    ]
  },
  {
    path: ['account', 'list'],
    summary: 'List managed agent accounts on this Markov host',
    usage: 'markov account list [--agent claude|codex|opencode|devin|antigravity] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'agent'],
    notes: [
      "Lists the accounts on this machine with the ids `markov account select` and `markov account rm` accept. `system` is the provider's own sign-in outside Markov.",
      '`--environment` / `--pairing-code` are rejected rather than ignored; run it on the host whose accounts you want to see.'
    ],
    examples: ['markov account list', 'markov account list --agent claude']
  },
  {
    path: ['account', 'select'],
    summary: 'Select the account new agent launches use on this Markov host',
    usage:
      'markov account select --agent claude|codex|opencode|devin|antigravity --account <id|email|label|system> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'agent', 'account'],
    notes: [
      "--account takes an id, email or label from `markov account list`, or `system` for the provider's own sign-in. An email shared by several accounts is refused; pass the id.",
      'The selection applies to agents launched on this host after it, like the status-bar account switcher. Antigravity has no `system` default.'
    ],
    examples: [
      'markov account select --agent claude --account me@work.example',
      'markov account select --agent codex --account system',
      'markov account select --agent antigravity --account me@gmail.example'
    ]
  },
  {
    path: ['account', 'rm'],
    aliases: [['account', 'remove']],
    destructive: true,
    summary: 'Remove a managed agent account and its private data',
    usage:
      'markov account rm --agent claude|codex|opencode|devin|antigravity --account <id|email|label> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'agent', 'account'],
    notes: [
      'Deletes the credentials Markov saved for that account (and, for OpenCode and Devin, the conversation data in its profile). Stop its running agents first. System credentials are never removed.',
      'Select another Antigravity account before removing the one in use.'
    ]
  }
]
