import { join } from 'node:path'

export function mcpGatewayDataDirectory(userDataPath: string): string {
  return join(userDataPath, 'mcp-connections')
}
