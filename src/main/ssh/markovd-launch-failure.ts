import { MarkovdWindowsLaunchFailedError } from '../managed-server/install/markovd-remote-launch-windows'
import { MarkovdLaunchReadinessError } from './markovd-active-readiness'

/** A launch that ended a run: it never became ready, or the host reported it could not start. */
export function isMarkovdLaunchFailure(error: unknown): error is Error {
  return (
    error instanceof MarkovdLaunchReadinessError || error instanceof MarkovdWindowsLaunchFailedError
  )
}

/** Only a readiness failure had a running markovd, whose death the next markovd will report. */
export function markovdLaunchFailureRanProcess(error: Error): boolean {
  return error instanceof MarkovdLaunchReadinessError
}
