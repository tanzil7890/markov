const STORAGE_KEY = 'markov.chat-model-usage.v1'
const DAY_MS = 86_400_000
/** How far back a sent message still counts toward the model a new chat starts on. */
export const CHAT_MODEL_USAGE_WINDOW_DAYS = 30

/** Messages sent per agent and model, by day (days since the epoch). `model` null is the agent's own default. */
export type ChatModelUsageDays = Readonly<Record<string, Readonly<Record<string, number>>>>

export type ChatModelUse = { agent: string; model: string | null; count: number }

function tallyKey(agent: string, model: string | null): string {
  return `${agent}\n${model ?? ''}`
}

function withinWindow(day: string, now: number): boolean {
  const age = Math.floor(now / DAY_MS) - Number(day)
  return Number.isInteger(age) && age >= 0 && age < CHAT_MODEL_USAGE_WINDOW_DAYS
}

/** One more sent message; days that left the window are dropped. */
export function withChatModelUse(
  days: ChatModelUsageDays,
  agent: string,
  model: string | null,
  now: number
): ChatModelUsageDays {
  const today = String(Math.floor(now / DAY_MS))
  const key = tallyKey(agent, model)
  const kept = Object.fromEntries(Object.entries(days).filter(([day]) => withinWindow(day, now)))
  return { ...kept, [today]: { ...kept[today], [key]: (kept[today]?.[key] ?? 0) + 1 } }
}

/** Uses inside the window, most used first; a tie goes to the one used most recently. */
export function rankChatModelUsage(days: ChatModelUsageDays, now: number): ChatModelUse[] {
  const totals = new Map<string, { count: number; lastDay: number }>()
  for (const [day, counts] of Object.entries(days)) {
    if (!withinWindow(day, now)) {
      continue
    }
    for (const [key, count] of Object.entries(counts)) {
      const total = totals.get(key) ?? { count: 0, lastDay: 0 }
      totals.set(key, {
        count: total.count + count,
        lastDay: Math.max(total.lastDay, Number(day))
      })
    }
  }
  return [...totals]
    .sort(([, a], [, b]) => b.count - a.count || b.lastDay - a.lastDay)
    .map(([key, { count }]) => {
      const [agent = '', model = ''] = key.split('\n')
      return { agent, model: model || null, count }
    })
}

function readStoredDays(): ChatModelUsageDays {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
      return {}
    }
    const days: Record<string, Record<string, number>> = {}
    for (const [day, counts] of Object.entries(saved)) {
      if (!counts || typeof counts !== 'object') {
        continue
      }
      days[day] = Object.fromEntries(
        Object.entries(counts).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0
        )
      )
    }
    return days
  } catch {
    // Storage may be unavailable; a new chat then starts on the default agent.
    return {}
  }
}

export function recordChatModelUse(agent: string, model: string | null): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(withChatModelUse(readStoredDays(), agent, model, Date.now()))
    )
  } catch {
    // Storage may be unavailable; the tally is a convenience.
  }
}

export function readChatModelUsage(): ChatModelUse[] {
  return rankChatModelUsage(readStoredDays(), Date.now())
}
