import type { McpGatewayService } from './mcp-gateway-service'

let installed: McpGatewayService | null = null

/** The desktop app installs its gateway at startup; hosts without one leave this empty. */
export function installMcpGateway(service: McpGatewayService | null): void {
  installed = service
}

export function getMcpGateway(): McpGatewayService | null {
  return installed
}
