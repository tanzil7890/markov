import type { CommandSpec } from '../args'

export const MCP_GATEWAY_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['mcp', 'serve'],
    // Markov starts it for the agents it launches; people never run it by hand.
    hidden: true,
    summary: 'Serve the tools of the connections set up in Markov to an agent over MCP',
    usage: 'markov mcp serve',
    allowedFlags: [],
    notes: ['Speaks MCP on stdin and stdout. Connections are managed in Settings → Connections.']
  }
]
