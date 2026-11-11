import type { MarkovdManagedRefusal } from './markovd-managed-runtime'
import type { MarkovdDaemonRetirementVerdict } from './markovd-stop-request'

export type MarkovdDecommissionResult =
  | {
      outcome: 'decommissioned'
      version: string
      /** The daemon's fate: `retired`, or kept with its terminals (`live`/`unverifiable`). */
      retirement: MarkovdDaemonRetirementVerdict
    }
  | MarkovdManagedRefusal
