import { RuntimeClientError } from '../../runtime-client'

export function resolveCompatibilityCliCommand(): 'markov' | 'markov-ide' | 'markov-dev' {
  const configured = process.env.MARKOV_CLI_COMMAND
  if (configured === 'markov' || configured === 'markov-ide' || configured === 'markov-dev') {
    return configured
  }
  return process.platform === 'linux' ? 'markov-ide' : 'markov'
}

export function resolvePackagedWindowsCompatibilityCommand(): 'markov' | 'markov-ide' | undefined {
  if (process.env.MARKOV_WINDOWS_PACKAGED_CLI_LAUNCHER !== '1') {
    return undefined
  }
  const command = process.env.MARKOV_CLI_COMMAND
  if (command === 'markov' || command === 'markov-ide') {
    return command
  }
  throw new RuntimeClientError(
    'invalid_argument',
    'The packaged Markov launcher did not provide a valid resume command. No question was created.'
  )
}

export async function flushOrchestrationStdout(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write('', (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export function isDevCliInvocation(): boolean {
  return (
    process.env.MARKOV_DEV_CLI_INVOCATION === '1' ||
    (process.env.MARKOV_USER_DATA_PATH?.includes('markov-dev') ?? false)
  )
}
