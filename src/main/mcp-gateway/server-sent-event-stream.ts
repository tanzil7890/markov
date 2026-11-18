export type ServerSentEvent = {
  event: string
  data: string
}

export class ServerSentEventTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Server-sent event exceeded ${maxBytes} bytes`)
    this.name = 'ServerSentEventTooLargeError'
  }
}

/** Yields each dispatched event; the caller stops reading by returning from its loop. */
export async function* readServerSentEvents(
  body: ReadableStream<Uint8Array>,
  maxEventBytes: number
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let event = ''
  let data: string[] = []
  let pendingBytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      // A trailing CR may be the first half of CRLF split across chunks.
      const usable = !done && buffer.endsWith('\r') ? buffer.length - 1 : buffer.length
      const lines = buffer.slice(0, usable).split(/\r\n|\n|\r/)
      const remainder = done ? '' : (lines.pop() ?? '')
      buffer = remainder + buffer.slice(usable)
      for (const line of lines) {
        if (line === '') {
          if (data.length > 0) {
            yield { event: event || 'message', data: data.join('\n') }
          }
          event = ''
          data = []
          pendingBytes = 0
          continue
        }
        if (line.startsWith(':')) {
          continue
        }
        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        const rest = colon === -1 ? '' : line.slice(colon + 1)
        const fieldValue = rest.startsWith(' ') ? rest.slice(1) : rest
        if (field === 'event') {
          event = fieldValue
        } else if (field === 'data') {
          pendingBytes += fieldValue.length
          data.push(fieldValue)
        }
      }
      if (pendingBytes + buffer.length > maxEventBytes) {
        throw new ServerSentEventTooLargeError(maxEventBytes)
      }
      if (done) {
        return
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}
