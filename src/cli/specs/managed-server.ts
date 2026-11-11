import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

const SELECTOR_NOTE =
  '--environment names a managed Markov server this machine deployed over SSH (see `markov environment list`); it is a selector here, not a routing flag.'
const DESKTOP_NOTE =
  'Runs on this machine’s Markov desktop app, the same action as Settings > Markov on your SSH hosts. A runtime without the SSH registry (headless `markov serve`) refuses it.'

export const MANAGED_SERVER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['environment', 'status'],
    summary: 'Show a managed Markov server’s active version, terminals and pending work',
    usage: 'markov environment status --environment <selector> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment'],
    notes: [SELECTOR_NOTE, DESKTOP_NOTE],
    examples: ['markov environment status --environment build-box']
  },
  {
    path: ['environment', 'update'],
    summary: 'Update a managed Markov server to this build’s version',
    usage: 'markov environment update --environment <selector> [--force] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment', 'force'],
    notes: [
      'Without --force, an update that would restart over running terminals is deferred and reported, not applied.',
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: ['markov environment update --environment build-box']
  },
  {
    path: ['environment', 'rollback'],
    destructive: true,
    summary: 'Roll a managed Markov server back to its previous version',
    usage: 'markov environment rollback --environment <selector> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment'],
    notes: [SELECTOR_NOTE, DESKTOP_NOTE]
  },
  {
    path: ['environment', 'recover'],
    summary: 'Finish or undo a managed Markov server’s interrupted update, rollback or stop',
    usage:
      'markov environment recover --environment <selector> [--accept-changed-state --yes] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment', 'accept-changed-state', 'yes'],
    notes: [
      'When a rejected build changed profile state, recover refuses rather than restart the previous build over it. --accept-changed-state --yes restores the prelaunch snapshot instead, the same as Restore in Settings > Markov on your SSH hosts; what the rejected build changed is discarded.',
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: [
      'markov environment recover --environment build-box',
      'markov environment recover --environment build-box --accept-changed-state --yes'
    ]
  },
  {
    path: ['environment', 'stop'],
    destructive: true,
    summary: 'Stop a managed Markov server and unlink it from this machine (decommission)',
    usage: 'markov environment stop --environment <selector> --yes [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment', 'yes'],
    notes: [
      'Stops markovd on the SSH host and, once the host proves it exited, removes the server from this machine and disconnects the host. Its terminals end. Connecting the host again sets up a new server. Requires --yes.',
      'If the host cannot prove markovd exited, the server stays linked and the refusal says why; nothing is removed on a guess. For a host that is gone for good, use `markov environment forget`.',
      'If this server is the default host for new projects, choose another one first. `markov environment cancel-stop` withdraws a stop markovd has not acted on yet.',
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: ['markov environment stop --environment build-box --yes']
  },
  {
    path: ['environment', 'forget'],
    destructive: true,
    summary: 'Unlink a managed Markov server whose SSH host is gone, without stopping it',
    usage: 'markov environment forget --environment <selector> --yes [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment', 'yes'],
    notes: [
      'Removes the server from this machine without contacting its host, so the SSH host can then be removed. Use it when the host was deleted or can never be reached again. Requires --yes.',
      'Nothing on the host is stopped: if it comes back, markovd may still be running there.',
      'The SSH host is left disconnected, since no Markov server serves it any more. Connecting it again (Connect in Markov) sets its server up again, relinking one still running there.',
      SELECTOR_NOTE,
      DESKTOP_NOTE
    ],
    examples: ['markov environment forget --environment build-box --yes']
  },
  {
    path: ['environment', 'cancel-stop'],
    summary: 'Withdraw a managed Markov server stop that markovd has not acted on yet',
    usage: 'markov environment cancel-stop --environment <selector> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'environment'],
    notes: [SELECTOR_NOTE, DESKTOP_NOTE]
  }
]
