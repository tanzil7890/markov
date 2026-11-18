import type { PipedProcessSpawner } from '@markov/process-host/process-spec'
import { encodeNdjson } from '../../shared/main-process-ndjson-framer'
import {
  spawnManagedProviderProcess,
  type ManagedProviderProcess
} from '../provider-process/managed-provider-process'
import { createProviderRecordReader } from '../provider-process/provider-record-reader'
import { ProviderStdioWriteQueue } from '../provider-process/provider-stdio-write-queue'
import {
  JSON_RPC_METHOD_NOT_FOUND,
  McpRpcError,
  isJsonRpcRequest,
  isJsonRpcResponse,
  jsonRpcError,
  jsonRpcMessageSchema,
  jsonRpcNotification,
  jsonRpcRequest,
  jsonRpcResult,
  type JsonRpcMessage
} from './mcp-json-rpc'
import {
  McpTransportError,
  type McpRequestOptions,
  type McpUpstreamTransport
} from './mcp-upstream-transport'

const MAX_QUEUED_WRITE_BYTES = 32 * 1024 * 1024
const STDERR_PREVIEW_CHARS = 400

export type McpStdioTransportOptions = {
  command: string
  args: string[]
  cwd?: string
  env: Record<string, string>
  spawnImpl?: PipedProcessSpawner
}

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
}

type RunningServer = {
  managed: ManagedProviderProcess
  writer: ProviderStdioWriteQueue
}

export function createMcpStdioTransport(options: McpStdioTransportOptions): McpUpstreamTransport {
  const pending = new Map<number, PendingRequest>()
  let running: RunningServer | null = null
  let ended: McpTransportError | null = null
  let nextId = 1

  function end(error: McpTransportError): void {
    if (ended) {
      return
    }
    ended = error
    running?.writer.close(error)
    for (const request of pending.values()) {
      request.reject(error)
    }
    pending.clear()
  }

  function exitError(managed: ManagedProviderProcess): McpTransportError {
    const stderr = managed.stderrTail().trim().slice(-STDERR_PREVIEW_CHARS)
    const code = managed.exitStatus?.code ?? null
    const reason = managed.executableMissing
      ? `Could not find the command "${options.command}"`
      : `The MCP server process stopped${code === null ? '' : ` with code ${code}`}`
    return new McpTransportError('closed', stderr ? `${reason}: ${stderr}` : reason)
  }

  function send(server: RunningServer, message: JsonRpcMessage): Promise<void> {
    return server.writer.write(encodeNdjson(message))
  }

  function dispatch(server: RunningServer, record: unknown): void {
    const parsed = jsonRpcMessageSchema.safeParse(record)
    if (!parsed.success) {
      return
    }
    const message = parsed.data
    if (isJsonRpcResponse(message)) {
      const request = typeof message.id === 'number' ? pending.get(message.id) : undefined
      if (!request || typeof message.id !== 'number') {
        return
      }
      pending.delete(message.id)
      if (message.error) {
        request.reject(
          new McpRpcError(message.error.code, message.error.message, message.error.data)
        )
      } else {
        request.resolve(message.result)
      }
      return
    }
    if (isJsonRpcRequest(message)) {
      const reply =
        message.method === 'ping'
          ? jsonRpcResult(message.id, {})
          : jsonRpcError(message.id, JSON_RPC_METHOD_NOT_FOUND, `Unsupported: ${message.method}`)
      void send(server, reply).catch(() => undefined)
    }
  }

  function start(): RunningServer {
    const managed = spawnManagedProviderProcess(
      {
        command: options.command,
        args: options.args,
        ...(options.cwd ? { cwd: options.cwd } : {}),
        env: options.env
      },
      {
        site: 'mcp-gateway-server',
        ...(options.spawnImpl ? { spawnImpl: options.spawnImpl } : {})
      }
    )
    const writer = new ProviderStdioWriteQueue(
      managed.child.stdin,
      MAX_QUEUED_WRITE_BYTES,
      () => end(exitError(managed)),
      {
        capacity: () => new McpTransportError('closed', 'Too much data queued for the MCP server'),
        closed: () => exitError(managed)
      }
    )
    const server: RunningServer = { managed, writer }
    managed.child.stdin.on('error', () => end(exitError(managed)))
    managed.child.on('error', () => end(exitError(managed)))
    createProviderRecordReader({
      stdout: managed.child.stdout,
      onRecord: (record) => dispatch(server, record),
      // Servers often print banners on stdout; only JSON-RPC lines matter.
      onRejected: () => undefined,
      onFatal: () => end(exitError(managed))
    })
    managed.onExit(() => end(exitError(managed)))
    return server
  }

  function live(): RunningServer {
    if (ended) {
      throw new McpTransportError('closed', ended.message, { retryable: true })
    }
    running ??= start()
    return running
  }

  async function request(
    method: string,
    params: unknown,
    { signal, timeoutMs }: McpRequestOptions
  ): Promise<unknown> {
    signal?.throwIfAborted()
    const server = live()
    const id = nextId++
    return new Promise<unknown>((resolve, reject) => {
      const settle = (): void => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        pending.delete(id)
      }
      const onAbort = (): void => {
        settle()
        void send(server, jsonRpcNotification('notifications/cancelled', { requestId: id })).catch(
          () => undefined
        )
        reject(signal?.reason instanceof Error ? signal.reason : new Error('Request cancelled'))
      }
      const timer = setTimeout(() => {
        settle()
        reject(new McpTransportError('timeout', `The MCP server did not answer ${method} in time`))
      }, timeoutMs)
      signal?.addEventListener('abort', onAbort, { once: true })
      pending.set(id, {
        resolve: (result) => {
          settle()
          resolve(result)
        },
        reject: (error) => {
          settle()
          reject(error)
        }
      })
      send(server, jsonRpcRequest(id, method, params)).catch((error: unknown) => {
        if (pending.has(id)) {
          settle()
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
  }

  return {
    request,
    async notify(method, params) {
      await send(live(), jsonRpcNotification(method, params))
    },
    setProtocolVersion() {},
    async close() {
      const server = running
      end(new McpTransportError('closed', 'The MCP server connection was closed'))
      await server?.managed.close().catch(() => undefined)
    }
  }
}
