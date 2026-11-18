import { runProcessSync } from '@markov/process-host'
import { describe, expect, it } from 'vitest'
import { codexMcpGatewayConfigOverride, withAgentMcpGateway } from './agent-mcp-gateway-launch'

const LAUNCH = {
  command: '/Applications/Markov.app/Contents/Resources/bin/markov',
  args: ['mcp', 'serve'],
  env: { MARKOV_USER_DATA_PATH: '/Users/a/Library/Application Support/markov' }
}
const CLAUDE_CONFIG = '/Users/a/Library/Application Support/markov/mcp/claude-mcp-config.json'
const CODEX_OVERRIDE =
  "mcp_servers.markov={command='/Applications/Markov.app/Contents/Resources/bin/markov',args=['mcp','serve'],env={MARKOV_USER_DATA_PATH='/Users/a/Library/Application Support/markov'}}"

function inject(command: string): string {
  return withAgentMcpGateway(command, 'posix', {
    claudeConfigPath: CLAUDE_CONFIG,
    codexConfigOverride: codexMcpGatewayConfigOverride(LAUNCH)
  })
}

/** The arguments `agent` receives when a POSIX shell runs the command line. */
function argumentsSeenBy(agent: string, command: string): string[] {
  const { stdout } = runProcessSync({
    program: '/bin/sh',
    args: ['-c', `${agent}() { for a in "$@"; do printf '%s\\n' "$a"; done; }; ${command}`]
  })
  return stdout.split('\n').slice(0, -1)
}

describe.runIf(process.platform !== 'win32')('withAgentMcpGateway', () => {
  it('gives Claude Code the config file as one argument, ahead of its options and prompt', () => {
    expect(argumentsSeenBy('claude', inject("claude --model opus 'fix the bug'"))).toEqual([
      `--mcp-config=${CLAUDE_CONFIG}`,
      '--model',
      'opus',
      'fix the bug'
    ])
  })

  it('gives Codex one config override whose TOML survives the shell', () => {
    expect(argumentsSeenBy('codex', inject("codex -c disable_paste_burst=true 'hi'"))).toEqual([
      '-c',
      CODEX_OVERRIDE,
      '-c',
      'disable_paste_burst=true',
      'hi'
    ])
  })

  it('leaves other agents, compound commands and commands that already set MCP servers alone', () => {
    expect(inject("gemini 'hi'")).toBe("gemini 'hi'")
    expect(inject('cd repo && claude')).toBe('cd repo && claude')
    expect(inject("codex -c 'mcp_servers={}'")).toBe("codex -c 'mcp_servers={}'")
  })
})

describe('codexMcpGatewayConfigOverride', () => {
  it('declines a path that a TOML literal string cannot hold', () => {
    expect(
      codexMcpGatewayConfigOverride({ ...LAUNCH, command: "/Users/o'brien/markov" })
    ).toBeNull()
  })
})
