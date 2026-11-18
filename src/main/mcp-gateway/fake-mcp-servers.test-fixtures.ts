import { createServer, type IncomingHttpHeaders } from 'node:http'
import { z } from 'zod'

const requestSchema = z.looseObject({
  id: z.number().optional(),
  method: z.string(),
  params: z
    .looseObject({
      arguments: z.looseObject({ text: z.string().optional() }).optional()
    })
    .optional()
})

export type FakeMcpHttpServer = {
  url: string
  /** Every POST in arrival order. */
  requests: { method: string; headers: IncomingHttpHeaders }[]
  close(): Promise<void>
}

/** A streamable-HTTP MCP server with one `echo` tool; `tools/list` answers over SSE. */
export async function startFakeMcpHttpServer(
  options: { requiredBearer?: string } = {}
): Promise<FakeMcpHttpServer> {
  const requests: FakeMcpHttpServer['requests'] = []
  const server = createServer((request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405).end()
      return
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const message = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      requests.push({ method: message.method, headers: request.headers })
      if (
        options.requiredBearer &&
        request.headers.authorization !== `Bearer ${options.requiredBearer}`
      ) {
        response.writeHead(401, {
          'www-authenticate': 'Bearer resource_metadata="https://fake.invalid/metadata"'
        })
        response.end()
        return
      }
      if (message.id === undefined) {
        response.writeHead(202).end()
        return
      }
      const reply = (result: unknown): string =>
        JSON.stringify({ jsonrpc: '2.0', id: message.id, result })
      if (message.method === 'initialize') {
        response.writeHead(200, {
          'content-type': 'application/json',
          'mcp-session-id': 'session-1'
        })
        response.end(
          reply({
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'fake-http', title: 'Fake HTTP' }
          })
        )
        return
      }
      if (message.method === 'tools/list') {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(
          `: keep-alive\n\nevent: message\ndata: ${reply({
            tools: [
              {
                name: 'echo',
                description: 'Echo text',
                inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
              }
            ]
          })}\n\n`
        )
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        reply({ content: [{ type: 'text', text: `echo:${message.params?.arguments?.text}` }] })
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

/** A stdio MCP server whose `env` tool returns one of its environment variables. */
export const FAKE_MCP_STDIO_SERVER_SCRIPT = `
const lines = require('node:readline').createInterface({ input: process.stdin })
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n')
console.log('fake server ready')
lines.on('line', (line) => {
  const message = JSON.parse(line)
  if (message.id === undefined) return
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-stdio' } } })
  } else if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'env', description: 'Read a variable', inputSchema: { type: 'object' } }] } })
  } else if (message.method === 'tools/call') {
    send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: String(process.env[message.params.arguments.name]) }] } })
  } else {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })
  }
})
`
