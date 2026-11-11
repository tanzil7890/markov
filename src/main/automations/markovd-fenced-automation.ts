import { getAppEnvironment } from '../../shared/app-environment'
import type { Automation } from '../../shared/automations-types'
import type { Store } from '../persistence/loading-store/store'
import { listMarkovdMigrationCutoverChainForTarget } from '../ssh/markovd-migration-cutover-journal'

export const MARKOVD_FENCED_AUTOMATION = "This automation now runs on its SSH host's Markov server."

/** While a move is in flight, or once it took this row, any desktop write would break or duplicate it. Rows Move anyway left behind stay runnable here. */
export function isMarkovdFencedAutomation(
  store: Pick<Store, 'getSshTarget'>,
  automation: Pick<Automation, 'id' | 'executionTargetType' | 'executionTargetId'>,
  userDataPath: () => string = () => getAppEnvironment().getPath('userData')
): boolean {
  if (
    automation.executionTargetType !== 'ssh' ||
    store.getSshTarget(automation.executionTargetId)?.markovdFence === undefined
  ) {
    return false
  }
  let chain
  try {
    chain = listMarkovdMigrationCutoverChainForTarget(userDataPath(), automation.executionTargetId)
  } catch {
    return true // An unreadable journal can't show the row stayed behind.
  }
  return (
    chain.length === 0 ||
    chain.some(
      (cutover) =>
        cutover.phase === 'source-fenced' ||
        cutover.phase === 'destination-staged' ||
        cutover.manifest.payload.dormantState?.automations?.some(({ id }) => id === automation.id)
    )
  )
}
