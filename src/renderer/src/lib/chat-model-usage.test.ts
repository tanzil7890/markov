import { describe, expect, it } from 'vitest'
import { rankChatModelUsage, withChatModelUse } from './chat-model-usage'

const DAY = 86_400_000
const NOW = 20_000 * DAY + 5_000

describe('chat model usage', () => {
  it('ranks the most used agent and model first, across days', () => {
    let days = withChatModelUse({}, 'claude', 'opus', NOW - 3 * DAY)
    days = withChatModelUse(days, 'codex', 'gpt-5.5', NOW - 2 * DAY)
    days = withChatModelUse(days, 'codex', 'gpt-5.5', NOW - DAY)
    days = withChatModelUse(days, 'claude', null, NOW)

    expect(rankChatModelUsage(days, NOW)).toEqual([
      { agent: 'codex', model: 'gpt-5.5', count: 2 },
      { agent: 'claude', model: null, count: 1 },
      { agent: 'claude', model: 'opus', count: 1 }
    ])
  })

  it('stops counting messages older than thirty days', () => {
    let days = withChatModelUse({}, 'claude', 'opus', NOW - 30 * DAY)
    days = withChatModelUse(days, 'claude', 'opus', NOW - 30 * DAY)
    expect(rankChatModelUsage(days, NOW)).toEqual([])

    days = withChatModelUse(days, 'codex', 'gpt-5.5', NOW)
    expect(Object.keys(days)).toEqual(['20000'])
    expect(rankChatModelUsage(days, NOW)).toEqual([{ agent: 'codex', model: 'gpt-5.5', count: 1 }])
  })
})
