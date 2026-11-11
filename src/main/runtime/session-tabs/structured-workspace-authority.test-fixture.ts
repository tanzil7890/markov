import type { MarkovRuntimeService } from '../markov-runtime'

export const availableRevealWorkspace: MarkovRuntimeService['prepareStructuredAgentSessionRevealWorkspace'] =
  async () => ({
    current: () => true,
    check: () => {},
    release: Object.assign(() => {}, { isCurrent: () => true })
  })
