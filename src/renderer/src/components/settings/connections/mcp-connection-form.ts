import {
  suggestMcpConnectionName,
  type McpConnectionDraft
} from '../../../../../shared/mcp-connections'
import {
  tokenizeStartupCommand,
  type AgentStartupShell
} from '../../../../../shared/agent-launch/startup/tui-agent-startup-shell'

export type McpConnectionFormKind = 'http' | 'stdio'

export type McpConnectionFormSecret = {
  key: number
  name: string
  value: string
}

export type McpConnectionForm = {
  kind: McpConnectionFormKind
  title: string
  /** The web address, or the command line that starts the server. */
  target: string
  /** Request headers (http) or environment variables (stdio). */
  secrets: McpConnectionFormSecret[]
}

export type McpConnectionFormProblem = 'title' | 'name-taken' | 'url' | 'command' | 'secret-name'

export const EMPTY_MCP_CONNECTION_FORM: McpConnectionForm = {
  kind: 'http',
  title: '',
  target: '',
  secrets: []
}

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function httpTransport(target: string): McpConnectionDraft['transport'] | null {
  try {
    const url = new URL(target.trim())
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? { kind: 'http', url: url.toString() }
      : null
  } catch {
    return null
  }
}

function stdioTransport(
  target: string,
  shell: AgentStartupShell
): McpConnectionDraft['transport'] | null {
  const parsed = tokenizeStartupCommand(target.trim(), shell)
  const [command, ...args] = parsed.ok ? parsed.tokens : []
  return command ? { kind: 'stdio', command, args } : null
}

/** The connection a filled-in form describes, or the first thing wrong with it. */
export function buildMcpConnectionDraft(
  form: McpConnectionForm,
  existingNames: readonly string[],
  shell: AgentStartupShell
): { draft: McpConnectionDraft } | { problem: McpConnectionFormProblem } {
  const title = form.title.trim()
  const name = suggestMcpConnectionName(title)
  if (!name) {
    return { problem: 'title' }
  }
  if (existingNames.includes(name)) {
    return { problem: 'name-taken' }
  }
  const transport =
    form.kind === 'http' ? httpTransport(form.target) : stdioTransport(form.target, shell)
  if (!transport) {
    return { problem: form.kind === 'http' ? 'url' : 'command' }
  }
  const secrets: Record<string, string> = {}
  for (const secret of form.secrets) {
    const secretName = secret.name.trim()
    if (!secretName && !secret.value) {
      continue
    }
    if (!(form.kind === 'http' ? HEADER_NAME : ENVIRONMENT_NAME).test(secretName)) {
      return { problem: 'secret-name' }
    }
    secrets[secretName] = secret.value
  }
  return { draft: { name, title, transport, secrets } }
}
