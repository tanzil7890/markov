// PostgreSQL returns BIGINT columns as strings; SQLite returns numbers.
export function rowNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error('expected a numeric column')
  }
  return parsed
}

export function rowOptionalNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : rowNumber(value)
}

export function rowString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('expected a text column')
  }
  return value
}

export function rowOptionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

// BYTEA comes back as a Buffer from PostgreSQL and a plain Uint8Array from SQLite.
export function rowBytes(value: unknown): Buffer {
  if (!(value instanceof Uint8Array)) {
    throw new Error('expected a binary column')
  }
  return Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
}
