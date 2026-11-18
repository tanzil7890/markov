import { z } from 'zod'
import { requiredString } from './rpc-param-primitives'

export const McpGatewayMessageParams = z.object({
  /** One `markov mcp serve` process, so its requests can be cancelled by id. */
  session: requiredString('Missing session'),
  /** A single JSON-RPC message from the agent. */
  message: z.record(z.string(), z.unknown())
})

/** The JSON-RPC reply to write back to the agent, or null when the message needs none. */
export type McpGatewayMessageResult = {
  reply: Record<string, unknown> | null
}
