import type { CloudDatabase } from '@markov-cloud/cloud-database'
import type { FileStorage, StoredFileStream } from './file-storage.js'
import { rowBytes, rowNumber } from './sql-row.js'

const CHUNK_BYTES = 1024 * 1024

// Bytes go in ~1 MiB rows so no single value nears PostgreSQL's limits or the statement timeout.
export class DatabaseFileStorage implements FileStorage {
  constructor(
    private readonly database: CloudDatabase,
    private readonly now: () => number
  ) {}

  async write(key: string, bytes: Uint8Array): Promise<void> {
    const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const chunkCount = Math.ceil(source.length / CHUNK_BYTES)
    await this.database.transaction(async (tx) => {
      await deleteFile(tx, key)
      for (let index = 0; index < chunkCount; index++) {
        await tx.query('INSERT INTO sharing_file_chunks (file_key, chunk_index, bytes) VALUES (?, ?, ?)', [
          key,
          index,
          source.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)
        ])
      }
      await tx.query(
        'INSERT INTO sharing_files (file_key, byte_size, chunk_count, created_at) VALUES (?, ?, ?, ?)',
        [key, source.length, chunkCount, this.now()]
      )
    })
  }

  async read(key: string): Promise<Buffer | null> {
    const file = await this.stream(key)
    if (!file) return null
    const chunks: Uint8Array[] = []
    for await (const chunk of file.body) chunks.push(chunk)
    return Buffer.concat(chunks, file.byteSize)
  }

  async stream(key: string): Promise<StoredFileStream | null> {
    const [file] = await this.database.query(
      'SELECT byte_size, chunk_count FROM sharing_files WHERE file_key = ?',
      [key]
    )
    if (!file) return null
    const chunkCount = rowNumber(file.chunk_count)
    let index = 0
    const body = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (index >= chunkCount) {
          controller.close()
          return
        }
        const [chunk] = await this.database.query(
          'SELECT bytes FROM sharing_file_chunks WHERE file_key = ? AND chunk_index = ?',
          [key, index]
        )
        if (!chunk) {
          controller.error(new Error('stored_file_chunk_missing'))
          return
        }
        index++
        controller.enqueue(rowBytes(chunk.bytes))
      }
    })
    return { byteSize: rowNumber(file.byte_size), body }
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      await this.database.transaction((tx) => deleteFile(tx, key))
    }
  }
}

async function deleteFile(database: CloudDatabase, key: string): Promise<void> {
  await database.query('DELETE FROM sharing_files WHERE file_key = ?', [key])
  await database.query('DELETE FROM sharing_file_chunks WHERE file_key = ?', [key])
}
