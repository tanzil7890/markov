export type StoredFileStream = { byteSize: number; body: ReadableStream<Uint8Array> }

// Where shared bytes live; the database is the default and Cloudflare R2 can implement the same shape.
export interface FileStorage {
  // Replaces any file already stored under the key.
  write(key: string, bytes: Uint8Array): Promise<void>
  read(key: string): Promise<Buffer | null>
  stream(key: string): Promise<StoredFileStream | null>
  delete(keys: readonly string[]): Promise<void>
}
