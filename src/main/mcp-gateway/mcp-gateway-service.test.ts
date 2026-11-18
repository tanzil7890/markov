import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secret-store'
import {
  FAKE_MCP_STDIO_SERVER_SCRIPT,
  startFakeMcpHttpServer
} from './fake-mcp-servers.test-fixtures'
import { McpConnectionSecretVault } from './mcp-connection-secret-vault'
import { McpConnectionStore } from './mcp-connection-store'
import { McpGatewayService } from './mcp-gateway-service'
import { McpOAuthAccess } from './mcp-oauth-access'
import { McpUpstreamPool } from './mcp-upstream-pool'

let directory = ''
const cleanups: (() => Promise<void>)[] = []

function createGateway(): McpGatewayService {
  const vault = new McpConnectionSecretVault(join(directory, 'secrets.json.enc'))
  const fetcher = (url: string, init: RequestInit): Promise<Response> => fetch(url, init)
  const service = new McpGatewayService({
    store: new McpConnectionStore(join(directory, 'connections.json')),
    vault,
    pool: new McpUpstreamPool({
      vault,
      access: new McpOAuthAccess(vault, fetcher, Date.now),
      fetch: fetcher,
      clientVersion: '1.0.0',
      resolveCommand: async () => null,
      now: Date.now
    }),
    serverVersion: '1.0.0',
    signIn: async () => undefined
  })
  cleanups.push(() => service.dispose())
  return service
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'markov-mcp-gateway-'))
  setSecretStore({
    isEncryptionAvailable: () => true,
    encryptString: (text) => Buffer.from(`sealed:${text}`),
    decryptString: (cipher) => cipher.toString().replace(/^sealed:/, ''),
    describeProtectionGap: () => null
  })
})

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
  _resetSecretStoreForTests()
  await rm(directory, { recursive: true, force: true })
})

describe('McpGatewayService', () => {
  it('serves every enabled connection under prefixed tool names and routes calls', async () => {
    const server = await startFakeMcpHttpServer()
    cleanups.push(server.close)
    const gateway = createGateway()
    await gateway.add({
      name: 'web',
      title: 'Web',
      transport: { kind: 'http', url: server.url },
      secrets: {}
    })
    await gateway.add({
      name: 'local',
      title: 'Local',
      transport: {
        kind: 'stdio',
        command: process.execPath,
        args: ['-e', FAKE_MCP_STDIO_SERVER_SCRIPT]
      },
      secrets: { FAKE_API_KEY: 'from-the-vault' }
    })

    expect(
      await gateway.handleAgentMessage('agent-1', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'agent' } }
      })
    ).toMatchObject({
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'markov' }
      }
    })
    expect(
      await gateway.handleAgentMessage('agent-1', { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    ).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: [
          {
            name: 'web__echo',
            description: 'Echo text',
            inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
          },
          { name: 'local__env', description: 'Read a variable', inputSchema: { type: 'object' } }
        ]
      }
    })
    expect(
      await gateway.handleAgentMessage('agent-1', {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'local__env', arguments: { name: 'FAKE_API_KEY' } }
      })
    ).toEqual({
      jsonrpc: '2.0',
      id: 3,
      result: { content: [{ type: 'text', text: 'from-the-vault' }] }
    })
    expect(await readFile(join(directory, 'connections.json'), 'utf8')).not.toContain(
      'from-the-vault'
    )
  })

  it('hides a connection that is switched off and reports the rest as connected', async () => {
    const server = await startFakeMcpHttpServer()
    cleanups.push(server.close)
    const gateway = createGateway()
    const web = await gateway.add({
      name: 'web',
      title: 'Web',
      transport: { kind: 'http', url: server.url },
      secrets: {}
    })
    const second = await gateway.add({
      name: 'second',
      title: 'Second',
      transport: { kind: 'http', url: server.url },
      secrets: {}
    })
    await gateway.setEnabled(second.id, false)

    expect(
      await gateway.handleAgentMessage('agent-1', { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    ).toMatchObject({ result: { tools: [{ name: 'web__echo' }] } })
    expect((await gateway.list()).map(({ id, status }) => ({ id, status }))).toEqual([
      { id: web.id, status: { state: 'connected', toolCount: 1, message: null } },
      { id: second.id, status: { state: 'disabled', toolCount: null, message: null } }
    ])
  })

  it('answers a call to a server that needs a sign-in with a tool error the agent can relay', async () => {
    const server = await startFakeMcpHttpServer({ requiredBearer: 'good-token' })
    cleanups.push(server.close)
    const gateway = createGateway()
    const locked = await gateway.add({
      name: 'locked',
      title: 'Locked',
      transport: { kind: 'http', url: server.url },
      secrets: {}
    })

    expect(
      await gateway.handleAgentMessage('agent-1', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'locked__echo', arguments: { text: 'hi' } }
      })
    ).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        content: [
          {
            type: 'text',
            text: 'The "Locked" connection needs a sign-in. Ask the person to open Markov Settings, go to Connections, and sign in.'
          }
        ],
        isError: true
      }
    })
    expect((await gateway.list()).find(({ id }) => id === locked.id)?.status.state).toBe(
      'needs-sign-in'
    )
  })
})
