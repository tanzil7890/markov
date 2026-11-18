import type { TuiAgent } from './tui-agent'

/**
 * The one record of which agents Markov offers. `false` only withholds an agent from detection,
 * pickers, settings and shortcuts; its launch config, hooks and status support stay in place, so
 * flipping it back to `true` restores it everywhere. See docs/agents-md-refs/offered-agents.md.
 */
export const TUI_AGENT_OFFERED: Record<TuiAgent, boolean> = {
  claude: true,
  'claude-agent-teams': true,
  codex: true,
  copilot: true,
  grok: true,
  pi: true,
  gemini: true,
  devin: true,
  dsh: true,

  antigravity: false,
  continue: false,
  openclaude: false,
  opencode2: false,
  opencode: false,
  'mimo-code': false,
  ante: false,
  trae: false,
  muse: false,
  qoder: false,
  'qoder-cn': false,
  zcode: false,
  omp: false,
  'prime-agent': false,
  aider: false,
  goose: false,
  amp: false,
  kilo: false,
  kiro: false,
  crush: false,
  aug: false,
  autohand: false,
  cline: false,
  codebuff: false,
  freebuff: false,
  'command-code': false,
  cursor: false,
  droid: false,
  kimi: false,
  'mistral-vibe': false,
  'qwen-code': false,
  rovo: false,
  hermes: false,
  openclaw: false,
  codebuddy: false,
  jcode: false
}

export function isOfferedTuiAgent(agent: TuiAgent): boolean {
  return TUI_AGENT_OFFERED[agent] === true
}
