import { describe, expect, it, vi } from 'vitest'
import { testMarkovSessionId } from '../../../../../shared/markov-session-address-test-fixture'
import { canonicalMarkovSessionId } from './canonical-markov-session-id'
import type { AgentSessionRecordReader } from './structured-session-lineage'
import { agentSessionConversationView } from '../../../../../shared/agent-session/lifecycle/agent-session-conversation-view'
import { agentSessionRecordFixture } from '../../../../native-chat/agent-session-record-test-fixture'

const ROOT = testMarkovSessionId('1f0c2a3b-4d5e-4f60-8a71-b2c3d4e5f601')
const CLEARED = testMarkovSessionId('2a1b3c4d-5e6f-4a70-9b81-c2d3e4f5a602')

describe('canonical session identity', () => {
  it('reads every record once per lineage revision, however many sessions it names', () => {
    const records = [
      agentSessionRecordFixture({
        sessionId: ROOT,
        conversationCommand: {
          command: 'clear',
          state: 'completed',
          replacementSessionId: CLEARED,
          operationId: 'clear-root',
          callerKey: 'client',
          phase: 'committed'
        }
      }),
      agentSessionRecordFixture({ sessionId: CLEARED })
    ].map(agentSessionConversationView)
    let revision = {}
    const listRecords = vi.fn(() => records)
    const store: Pick<AgentSessionRecordReader, 'listRecords' | 'lineageRevision'> = {
      listRecords,
      lineageRevision: () => revision
    }
    for (let check = 0; check < 40; check += 1) {
      expect(canonicalMarkovSessionId(CLEARED, store)).toBe(ROOT)
    }
    expect(listRecords).toHaveBeenCalledTimes(1)
    // A record joining, leaving or clearing publishes a new revision: the next lookup sees it.
    revision = {}
    expect(canonicalMarkovSessionId(ROOT, store)).toBe(ROOT)
    expect(listRecords).toHaveBeenCalledTimes(2)
  })
})
