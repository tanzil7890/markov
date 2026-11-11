import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

const CLOUD_FLAGS = ['api-url']

export const ARTIFACT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['artifacts', 'share'],
    summary: 'Share an HTML or Markdown file with your Markov account',
    usage: 'markov artifacts share <file> [--api-url <url>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file'],
    examples: ['markov artifacts share ./report.html', 'markov artifacts share ./notes.md --json']
  },
  {
    path: ['artifacts', 'update'],
    summary: 'Update a file previously shared from this Markov profile',
    usage: 'markov artifacts update <file> [--api-url <url>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'unshare'],
    destructive: true,
    summary: 'Delete the artifact associated with a previously shared file',
    usage: 'markov artifacts unshare <file> [--api-url <url>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...CLOUD_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'list'],
    summary: 'List artifacts owned by the signed-in Markov account',
    usage: 'markov artifacts list [--cursor <cursor>] [--api-url <url>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...CLOUD_FLAGS, 'cursor']
  },
  {
    path: ['artifacts', 'delete'],
    aliases: [['artifacts', 'rm']],
    destructive: true,
    summary: 'Delete an artifact owned by the signed-in Markov account',
    usage: 'markov artifacts delete <id> [--api-url <url>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, ...CLOUD_FLAGS, 'id'],
    positionalArgs: ['id']
  }
]
