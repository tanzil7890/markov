import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { CommandHandler } from '../dispatch'
import { writeStdoutLine } from '../stdout-line'
import type { McpGatewayMessageResult } from '../../shared/rpc-contract/mcp-gateway-params'

// Longer than the gateway's own tool-call limit, so its answer always arrives first.
const FORWARD_TIMEOUT_MS = 11 * 60_000
const JSON_RPC_PARSE_ERROR = -32700
const JSON_RPC_INTERNAL_ERROR = -32603

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMessage(line: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(line)
    return isJsonObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function errorReply(id: unknown, code: number, message: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: typeof id === 'string' || typeof id === 'number' ? id : null,
    error: { code, message }
  })
}

export const MCP_GATEWAY_HANDLERS: Record<string, CommandHandler> = {
  // Stdout carries only JSON-RPC lines for the agent; everything else goes to stderr.
  'mcp serve': async ({ client }) => {
    const session = randomUUID()
    const forward = async (message: Record<string, unknown>): Promise<void> => {
      try {
        const { result } = await client.call<McpGatewayMessageResult>(
          'mcpGateway.message',
          { session, message },
          { timeoutMs: FORWARD_TIMEOUT_MS }
        )
        if (result.reply) {
          writeStdoutLine(JSON.stringify(result.reply))
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        process.stderr.write(`markov mcp serve: ${detail}\n`)
        if (typeof message.method === 'string' && message.id !== undefined && message.id !== null) {
          writeStdoutLine(
            errorReply(
              message.id,
              JSON_RPC_INTERNAL_ERROR,
              `Markov could not be reached: ${detail}`
            )
          )
        }
      }
    }
    for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
      if (!line.trim()) {
        continue
      }
      const message = parseMessage(line)
      if (message) {
        // Not awaited: an agent may run several calls at once and cancel any of them.
        void forward(message)
      } else {
        writeStdoutLine(errorReply(null, JSON_RPC_PARSE_ERROR, 'Parse error'))
      }
    }
    // The agent closed the pipe, so replies to calls still running have nowhere to go.
    process.exit(0)
  }
}
