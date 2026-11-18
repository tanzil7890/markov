import { afterEach, describe, expect, it } from 'vitest'
import {
  FAKE_MCP_STDIO_SERVER_SCRIPT,
  startFakeMcpHttpServer,
  type FakeMcpHttpServer
} from './fake-mcp-servers.test-fixtures'
import { createMcpStdioTransport } from './mcp-stdio-transport'
import { createMcpStreamableHttpTransport } from './mcp-streamable-http-transport'
import { McpUpstreamSession } from './mcp-upstream-session'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

function httpSession(server: FakeMcpHttpServer, headers: Record<string, string> = {}) {
  const session = new McpUpstreamSession({
    clientVersion: '1.0.0',
    createTransport: () =>
      createMcpStreamableHttpTransport({
        url: server.url,
        fetch: (url, init) => fetch(url, init),
        headers: async () => headers
      })
  })
  cleanups.push(() => session.close(), server.close)
  return session
}

function stdioSession(command: string, args: string[], env: Record<string, string> = {}) {
  const session = new McpUpstreamSession({
    clientVersion: '1.0.0',
    createTransport: () => createMcpStdioTransport({ command, args, env })
  })
  cleanups.push(() => session.close())
  return session
}

describe('McpUpstreamSession over streamable HTTP', () => {
  it('lists tools from an SSE reply and calls one within the server session', async () => {
    const server = await startFakeMcpHttpServer()
    const session = httpSession(server)

    expect(await session.listTools()).toEqual([
      {
        name: 'echo',
        description: 'Echo text',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
      }
    ])
    expect(await session.callTool('echo', { text: 'hi' }, undefined)).toEqual({
      content: [{ type: 'text', text: 'echo:hi' }]
    })

    const call = server.requests.find((request) => request.method === 'tools/call')
    expect(call?.headers['mcp-session-id']).toBe('session-1')
    expect(call?.headers['mcp-protocol-version']).toBe('2025-06-18')
  })

  it('reports a server that wants a sign-in, with its challenge', async () => {
    const server = await startFakeMcpHttpServer({ requiredBearer: 'good-token' })
    const session = httpSession(server)

    await expect(session.listTools()).rejects.toMatchObject({
      failure: 'auth-required',
      challenge: 'Bearer resource_metadata="https://fake.invalid/metadata"'
    })
  })

  it('sends the configured headers', async () => {
    const server = await startFakeMcpHttpServer({ requiredBearer: 'good-token' })
    const session = httpSession(server, { authorization: 'Bearer good-token' })

    expect((await session.listTools()).map((tool) => tool.name)).toEqual(['echo'])
  })
})

describe('McpUpstreamSession over stdio', () => {
  it('starts the server with its environment and ignores its stdout banner', async () => {
    const session = stdioSession(process.execPath, ['-e', FAKE_MCP_STDIO_SERVER_SCRIPT], {
      FAKE_API_KEY: 'configured-value'
    })

    expect((await session.listTools()).map((tool) => tool.name)).toEqual(['env'])
    expect(await session.callTool('env', { name: 'FAKE_API_KEY' }, undefined)).toEqual({
      content: [{ type: 'text', text: 'configured-value' }]
    })
  })

  it('names the command that could not be found', async () => {
    const session = stdioSession('markov-no-such-mcp-server', [])

    await expect(session.listTools()).rejects.toThrow(
      'Could not find the command "markov-no-such-mcp-server"'
    )
  })
})
