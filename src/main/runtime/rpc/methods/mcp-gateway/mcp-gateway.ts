import { defineMethod } from '../../core'
import {
  McpGatewayMessageParams,
  type McpGatewayMessageResult
} from '../../../../../shared/rpc-contract/mcp-gateway-params'
import { getMcpGateway } from '../../../../mcp-gateway/mcp-gateway-installation'
import { JSON_RPC_INTERNAL_ERROR, jsonRpcError } from '../../../../mcp-gateway/mcp-json-rpc'

export const MCP_GATEWAY_METHODS = [
  defineMethod({
    name: 'mcpGateway.message',
    permission: 'workspace',
    params: McpGatewayMessageParams,
    handler: async (params, { signal }): Promise<McpGatewayMessageResult> => {
      const gateway = getMcpGateway()
      if (!gateway) {
        const id = params.message.id
        return {
          reply:
            typeof id === 'string' || typeof id === 'number'
              ? jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, 'Connections are not set up on this host')
              : null
        }
      }
      return { reply: await gateway.handleAgentMessage(params.session, params.message, signal) }
    }
  })
]
