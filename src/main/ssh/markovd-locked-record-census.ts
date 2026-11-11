import type { MarkovdActivationRecord } from '../managed-server/activation/markovd-activation-record'
import {
  type MarkovdTerminalCensus,
  UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
} from '../../shared/markovd-terminal-census'
import type { MarkovdDeployOptions } from './markovd-remote-deploy'

type MarkovdCensusOptions = Pick<MarkovdDeployOptions, 'census' | 'censusRecord'>

export function countedLockedRecord(
  options: MarkovdCensusOptions,
  record: MarkovdActivationRecord
): boolean {
  const counted = options.censusRecord
  return (
    !counted || (counted.active === record.active && counted.activatedAt === record.activatedAt)
  )
}

/** A census of another incumbent cannot authorize stopping this one. */
export function censusForLockedRecord(
  options: MarkovdCensusOptions,
  record: MarkovdActivationRecord
): MarkovdTerminalCensus {
  return countedLockedRecord(options, record)
    ? options.census
    : UNVERIFIABLE_MARKOVD_TERMINAL_CENSUS
}
