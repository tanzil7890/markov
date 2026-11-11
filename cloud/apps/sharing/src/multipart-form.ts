const MAX_PARTS = 32
const MAX_PART_HEADER_BYTES = 8 * 1024
const CRLF = Buffer.from('\r\n')
const HEADER_END = Buffer.from('\r\n\r\n')

export type MultipartForm = { fields: Map<string, string>; files: Map<string, Buffer> }

export function multipartBoundary(contentType: string | undefined): string | null {
  const match = /^multipart\/form-data\s*;(?:.*;)?\s*boundary=(?:"([^"]{1,70})"|([^\s;"]{1,70}))/i.exec(
    contentType ?? ''
  )
  return match?.[1] ?? match?.[2] ?? null
}

export async function readBodyUpTo(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<Buffer | null> {
  if (!body) return Buffer.alloc(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return Buffer.concat(chunks, total)
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
}

function dispositionParameter(headers: string, name: string): string | null {
  const disposition = /^content-disposition:\s*form-data(.*)$/im.exec(headers)?.[1]
  if (disposition === undefined) return null
  const match = new RegExp(`;\\s*${name}="((?:[^"\\\\]|\\\\.)*)"`, 'i').exec(disposition)
  return match ? match[1]!.replace(/\\(.)/g, '$1') : null
}

export function parseMultipartForm(body: Buffer, boundary: string): MultipartForm | null {
  const delimiter = Buffer.from(`--${boundary}`)
  const separator = Buffer.from(`\r\n--${boundary}`)
  const form: MultipartForm = { fields: new Map(), files: new Map() }
  const start = body.indexOf(delimiter)
  if (start === -1) return null
  let position = start + delimiter.length
  for (let parts = 0; ; parts++) {
    if (body.subarray(position, position + 2).toString('latin1') === '--') return form
    if (parts >= MAX_PARTS || !body.subarray(position, position + 2).equals(CRLF)) return null
    position += 2
    const headerEnd = body.indexOf(HEADER_END, position)
    if (headerEnd === -1 || headerEnd - position > MAX_PART_HEADER_BYTES) return null
    const headers = body.subarray(position, headerEnd).toString('utf8')
    const contentStart = headerEnd + HEADER_END.length
    const contentEnd = body.indexOf(separator, contentStart)
    if (contentEnd === -1) return null
    const name = dispositionParameter(headers, 'name')
    if (name === null) return null
    const content = body.subarray(contentStart, contentEnd)
    if (dispositionParameter(headers, 'filename') !== null) {
      if (!form.files.has(name)) form.files.set(name, content)
    } else if (!form.fields.has(name)) {
      form.fields.set(name, content.toString('utf8'))
    }
    position = contentEnd + separator.length
  }
}
