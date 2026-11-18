import { mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  MCP_CONNECTION_LIMIT,
  mcpConnectionSchema,
  type McpConnection
} from '../../shared/mcp-connections'
import { durableWriteTempPath, writeFileDurable } from '../filesystem/durable-file-write'

const connectionFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  connections: z.array(mcpConnectionSchema).max(MCP_CONNECTION_LIMIT)
})

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** The saved connections, without their secrets. Reads are served from memory once loaded. */
export class McpConnectionStore {
  private connections: McpConnection[] = []
  private loading: Promise<void> | null = null
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  /** A damaged file rejects here and on every change, so it is never silently replaced. */
  load(): Promise<void> {
    this.loading ??= this.read()
    return this.loading
  }

  /** Empty until `load` resolves. */
  list(): readonly McpConnection[] {
    return this.connections
  }

  async mutate(
    mutation: (connections: readonly McpConnection[]) => McpConnection[]
  ): Promise<void> {
    const update = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        await this.load()
        const next = connectionFileSchema.parse({
          schemaVersion: 1,
          connections: mutation(this.connections)
        })
        await mkdir(dirname(this.filePath), { recursive: true })
        await writeFileDurable(
          durableWriteTempPath(this.filePath),
          this.filePath,
          JSON.stringify(next, null, 2)
        )
        this.connections = next.connections
      })
    this.writeChain = update
    await update
  }

  private async read(): Promise<void> {
    let text: string
    try {
      text = await readFile(this.filePath, 'utf8')
    } catch (error) {
      if (isMissingFile(error)) {
        return
      }
      throw error
    }
    try {
      this.connections = connectionFileSchema.parse(JSON.parse(text)).connections
    } catch (error) {
      throw new Error(
        `The saved connections file is damaged: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
