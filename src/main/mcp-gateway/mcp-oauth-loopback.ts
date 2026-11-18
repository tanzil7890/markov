import { createServer, type Server } from 'node:http'
import {
  MARKOV_CLOUD_CALLBACK_RESPONSE_HEADERS,
  loopbackCallbackSuccessPage
} from '../markov-profiles/profile-cloud-callback-page'

const CALLBACK_PATH = '/callback'
const SIGN_IN_TIMEOUT_MS = 5 * 60_000
const SUCCESS_PAGE = loopbackCallbackSuccessPage(
  'Connection signed in',
  'You can close this tab and return to Markov.'
)

export class McpOAuthSignInError extends Error {
  readonly cancelled: boolean

  constructor(message: string, cancelled = false) {
    super(message)
    this.name = 'McpOAuthSignInError'
    this.cancelled = cancelled
  }
}

export type McpOAuthLoopback = {
  redirectUri: string
  /** Resolves with the authorization code once the browser returns with the matching state. */
  waitForCode(state: string, signal?: AbortSignal): Promise<string>
  close(): void
}

function closeServer(server: Server): void {
  server.closeAllConnections()
  server.close()
}

/** Listens on this machine only, on a port the system picks. */
export function openMcpOAuthLoopback(): Promise<McpOAuthLoopback> {
  return new Promise((resolve, reject) => {
    let expectedState: string | null = null
    let settle: { resolve: (code: string) => void; reject: (error: Error) => void } | null = null
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end('Not found')
        return
      }
      // Stray loopback requests must not end a sign-in that is still in progress.
      if (!settle || url.searchParams.get('state') !== expectedState) {
        response.writeHead(400).end('Invalid sign-in response.')
        return
      }
      const code = url.searchParams.get('code')
      if (url.searchParams.has('error') || !code) {
        const denied = url.searchParams.get('error') === 'access_denied'
        response
          .writeHead(400)
          .end(
            denied ? 'Sign-in was cancelled.' : 'Sign-in failed. Return to Markov and try again.'
          )
        settle.reject(
          new McpOAuthSignInError(
            denied ? 'The sign-in was cancelled.' : 'The sign-in service reported an error.',
            denied
          )
        )
        return
      }
      response.writeHead(200, MARKOV_CLOUD_CALLBACK_RESPONSE_HEADERS).end(SUCCESS_PAGE)
      settle.resolve(code)
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        closeServer(server)
        reject(new McpOAuthSignInError('Could not listen for the sign-in to finish.'))
        return
      }
      resolve({
        redirectUri: `http://127.0.0.1:${address.port}${CALLBACK_PATH}`,
        waitForCode(state, signal) {
          expectedState = state
          return new Promise<string>((resolveCode, rejectCode) => {
            const finish = (): void => {
              clearTimeout(timeout)
              signal?.removeEventListener('abort', cancel)
              settle = null
            }
            const cancel = (): void => {
              finish()
              rejectCode(new McpOAuthSignInError('The sign-in was cancelled.', true))
            }
            const timeout = setTimeout(() => {
              finish()
              rejectCode(new McpOAuthSignInError('The sign-in was not finished in time.'))
            }, SIGN_IN_TIMEOUT_MS)
            signal?.addEventListener('abort', cancel, { once: true })
            settle = {
              resolve: (code) => {
                finish()
                resolveCode(code)
              },
              reject: (error) => {
                finish()
                rejectCode(error)
              }
            }
            if (signal?.aborted) {
              cancel()
            }
          })
        },
        close: () => closeServer(server)
      })
    })
  })
}
