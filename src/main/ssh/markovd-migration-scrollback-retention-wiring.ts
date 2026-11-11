import type { Store } from '../persistence/loading-store/store'
import {
  listMarkovdMigrationSourceCutovers,
  setMarkovdMigrationJournalChangeListener
} from './markovd-migration-cutover-journal'

export function installMarkovdMigrationScrollbackRetention(
  userDataPath: string,
  store: Pick<Store, 'syncMarkovdMigrationScrollbackRetention'>
): void {
  const sync = (path: string): void => {
    try {
      // Retain bytes until durable commit/abort; closed tabs must still upload on retry.
      const pending = listMarkovdMigrationSourceCutovers(path).filter(
        (cutover) => cutover.phase === 'source-fenced' || cutover.phase === 'destination-staged'
      )
      store.syncMarkovdMigrationScrollbackRetention(pending.map((cutover) => cutover.manifest))
    } catch (error) {
      // An unreadable journal keeps whatever is held; releasing on a guess could lose bytes.
      console.warn('[markovd-migration] Could not sync scrollback retention:', error)
    }
  }
  setMarkovdMigrationJournalChangeListener(sync)
  sync(userDataPath)
}
