import type { ContentfulStatusCode } from 'hono/utils/http-status'

// The desktop reads only `code`; `message` is for humans reading logs or curl output.
export class SharingError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message?: string
  ) {
    super(message ?? code)
  }
}
