// Exit 0 means JSON was printed; read its outcome. Exit 64 is invalid input, 1 is failure without exit proof.
import {
  MARKOVD_CANCEL_MANAGED_STOP_FLAG,
  MARKOVD_COMPLETE_MANAGED_STOP_FLAG,
  MARKOVD_MANAGED_STOP_REQUEST_FILE_FLAG,
  MarkovdManagedStopRequestSchema,
  type MarkovdManagedStopCancellation,
  type MarkovdManagedStopCompletion,
  type MarkovdManagedStopRequest
} from '../../shared/markovd-stop-request'
import { cancelMarkovdManagedStop } from './markovd-managed-stop-cancellation'
import { readMarkovdCompletedStopReceipt } from './markovd-completed-stop-receipt'
import { readMarkovdManagedStopRequest } from './markovd-managed-stop-request'
import { ZodError } from 'zod'
import {
  completeMarkovdManagedStop,
  type MarkovdManagedStopCompletionOptions
} from './markovd-managed-stop-completion'

export async function runMarkovdManagedStopCommand(
  argv: readonly string[],
  options: MarkovdManagedStopCompletionOptions = {}
): Promise<MarkovdManagedStopCompletion> {
  const request = parseRequestArgument(argv, MARKOVD_COMPLETE_MANAGED_STOP_FLAG)
  const verdict = await completeMarkovdManagedStop(request, options)
  const retirement =
    verdict === 'exited' && request.retireIdleDaemon
      ? readMarkovdCompletedStopReceipt(request)?.retirement
      : undefined
  const completion: MarkovdManagedStopCompletion = {
    ...request,
    kind: 'markovd_managed_stop_completion',
    verdict,
    receiptPersisted: verdict === 'exited',
    ...(retirement ? { retirement } : {})
  }
  process.stdout.write(`${JSON.stringify(completion)}\n`)
  return completion
}

export function runMarkovdManagedStopCancelCommand(
  argv: readonly string[]
): MarkovdManagedStopCancellation {
  const request = parseRequestArgument(argv, MARKOVD_CANCEL_MANAGED_STOP_FLAG)
  const cancellation: MarkovdManagedStopCancellation = {
    ...request,
    kind: 'markovd_managed_stop_cancellation',
    outcome: cancelMarkovdManagedStop(request)
  }
  process.stdout.write(`${JSON.stringify(cancellation)}\n`)
  return cancellation
}

function parseRequestArgument(argv: readonly string[], flag: string): MarkovdManagedStopRequest {
  if (argv[0] !== flag) {
    throw new Error('markovd_managed_stop_invalid_arguments')
  }
  if (argv[1] === MARKOVD_MANAGED_STOP_REQUEST_FILE_FLAG) {
    if (argv.length !== 3 || !argv[2]) {
      throw new Error('markovd_managed_stop_invalid_arguments')
    }
    return readMarkovdManagedStopRequest(argv[2])
  }
  if (argv.length !== 2 || !argv[1]) {
    throw new Error('markovd_managed_stop_invalid_arguments')
  }
  return MarkovdManagedStopRequestSchema.parse(JSON.parse(argv[1]))
}

export const MARKOVD_MANAGED_STOP_EXIT_VERDICT = 0
export const MARKOVD_MANAGED_STOP_EXIT_FAILED = 1
export const MARKOVD_MANAGED_STOP_EXIT_USAGE = 64

export async function runMarkovdManagedStopCommandAndExit(argv: readonly string[]): Promise<void> {
  let code = MARKOVD_MANAGED_STOP_EXIT_VERDICT
  try {
    if (argv[0] === MARKOVD_CANCEL_MANAGED_STOP_FLAG) {
      runMarkovdManagedStopCancelCommand(argv)
    } else {
      await runMarkovdManagedStopCommand(argv)
    }
  } catch (error) {
    console.error('markovd: managed stop failed:', error)
    code =
      error instanceof ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === 'markovd_managed_stop_invalid_arguments')
        ? MARKOVD_MANAGED_STOP_EXIT_USAGE
        : MARKOVD_MANAGED_STOP_EXIT_FAILED
  }
  // Drain stdout before exit: callers read the result to EOF.
  process.stdout.write('', () => process.exit(code))
}
