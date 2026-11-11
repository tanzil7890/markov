import type {
  ConnectorEvent,
  ConnectorPendingPrompt,
  ConnectorProject,
  ConnectorReplyRequest,
  ConnectorReplyResponse
} from '@markov-cloud/connector-contract'
import type { ChatInbound, ChatMessage, ChatPlatform, ChatThread, ChatUser } from './chat/chat-platform.js'
import type { ConversationRecord, ConversationStore } from './conversation-store.js'
import type { DeliveryBody, DeliveryQueue, StoredDelivery } from './delivery-queue.js'
import type { MachineKey, MachineRecord, MachineStore } from './machine-store.js'
import type { PollWaiters } from './poll-waiters.js'

const AGENT_NAMES: Record<string, string> = { claude: 'Claude', codex: 'Codex' }
const STOP_WORDS = new Set(['stop', 'cancel'])
const MAX_PROJECT_CHOICES = 10

const STOP_REASONS: Record<string, string> = {
  failure: 'The turn failed.',
  cancellation: 'The turn was cancelled.',
  interruption: 'The turn was interrupted.',
  superseded: 'A newer message replaced this turn.',
  unconfirmed: 'Markov could not confirm how the turn ended.'
}

type ProjectChoice = { machine: MachineRecord; project: ConnectorProject }

export type ConnectorRouterDependencies = {
  machines: MachineStore
  deliveries: DeliveryQueue
  conversations: ConversationStore
  waiters: PollWaiters
  chat: ChatPlatform | null
  now: () => number
  machineOnlineMs: number
}

function agentName(agent: string): string {
  return AGENT_NAMES[agent] ?? agent
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/^#/, '').replace(/:$/, '')
}

function projectMatches(project: ConnectorProject, word: string): boolean {
  const names = [project.name, project.remote, project.remote?.split('/').pop()]
  return names.some((name) => name !== undefined && name.toLowerCase() === word)
}

function ownedBy(record: ConversationRecord | null, key: MachineKey): record is ConversationRecord {
  return record !== null && record.userId === key.userId && record.machineId === key.machineId
}

function threadOf(record: ConversationRecord): ChatThread {
  return { conversation: record.conversation, route: record.route }
}

function promptMessage(record: ConversationRecord, prompt: ConnectorPendingPrompt): ChatMessage {
  if (prompt.kind === 'unsupported') {
    return { text: `${agentName(record.agent)} is waiting for input that can only be answered in Markov.` }
  }
  const lead =
    prompt.kind === 'approval'
      ? [`**${agentName(record.agent)} wants to use ${prompt.tool}**`, prompt.summary]
      : [prompt.header ? `**${prompt.header}**` : undefined, prompt.question]
  return {
    text: lead.filter(Boolean).join('\n'),
    actions: {
      kind: 'answer',
      buttons: prompt.options.map((option, index) => ({
        label: option.label.trim() || option.id,
        value: JSON.stringify({ p: prompt.promptId, o: option.id }),
        ...(index === 0 ? { style: 'primary' as const } : {})
      }))
    }
  }
}

export class ConnectorRouter {
  constructor(private readonly deps: ConnectorRouterDependencies) {}

  private async post(thread: ChatThread, message: ChatMessage): Promise<string | null> {
    if (!this.deps.chat) return null
    try {
      return await this.deps.chat.post(thread, message)
    } catch (error) {
      console.warn(JSON.stringify({ event: 'markov_connector_chat_post_failed', message: String(error) }))
      return null
    }
  }

  private async update(thread: ChatThread, messageId: string, message: ChatMessage): Promise<void> {
    await this.deps.chat?.update(thread, messageId, message).catch((error: unknown) => {
      console.warn(JSON.stringify({ event: 'markov_connector_chat_update_failed', message: String(error) }))
    })
  }

  private async enqueue(record: ConversationRecord, body: DeliveryBody): Promise<void> {
    await this.deps.deliveries.enqueue(record, record.conversation, body)
    this.deps.waiters.wake(record)
  }

  private isOnline(machine: MachineRecord): boolean {
    const recent = machine.seenAt !== null && this.deps.now() - machine.seenAt < this.deps.machineOnlineMs
    return recent || this.deps.waiters.isWaiting(machine)
  }

  async onChat(event: ChatInbound): Promise<void> {
    const record = await this.deps.conversations.get(event.thread.conversation)
    if (event.type === 'action') {
      await (event.kind === 'answer'
        ? this.answerPrompt(record, event.user, event.value, event.thread, event.messageId)
        : this.chooseProject(event.user, event.value, event.thread, event.messageId))
      return
    }
    if (record) {
      if (record.chatUserId !== event.user.id) {
        if (event.addressed) {
          await this.post(event.thread, { text: 'Only the person who started this conversation can steer it.' })
        }
        return
      }
      const text = event.text.trim()
      if (!text) return
      await this.enqueue(record, STOP_WORDS.has(text.toLowerCase()) ? { kind: 'cancel' } : { kind: 'send', text })
      return
    }
    if (event.addressed) await this.startRequest(event.thread, event.user, event.text)
  }

  private async startRequest(thread: ChatThread, user: ChatUser, text: string): Promise<void> {
    if (!user.email) {
      await this.post(thread, { text: "I can't see your email address, so I can't find your Markov desktop." })
      return
    }
    const machines = (await this.deps.machines.machinesForEmail(user.email)).filter(
      (machine) => this.isOnline(machine) && machine.hello?.sources.includes(thread.conversation.source)
    )
    if (machines.length === 0) {
      await this.post(thread, {
        text: `I couldn't find a Markov desktop signed in as ${user.email} that is online. Open Markov, sign in with that email, and turn on connectors.`
      })
      return
    }
    const choices: ProjectChoice[] = machines.flatMap((machine) =>
      (machine.hello?.projects ?? []).map((project) => ({ machine, project }))
    )
    const knownAgents = new Set(machines.flatMap((machine) => machine.hello?.agents ?? []))
    let words = text.trim().split(/\s+/).filter(Boolean)
    let agent: string | null = null
    let chosen: ProjectChoice | null = null
    for (let index = 0; index < 2 && words.length > 0; index++) {
      const word = normalizeWord(words[0]!)
      if (!agent && knownAgents.has(word)) {
        agent = word
      } else if (!chosen) {
        chosen = choices.find((choice) => projectMatches(choice.project, word)) ?? null
        if (!chosen) break
      } else {
        break
      }
      words = words.slice(1)
    }
    const prompt = words.join(' ').trim()
    if (!prompt) {
      await this.post(thread, {
        text: 'Tell me what to do, for example: `my-repo fix the failing login test`. Start with `codex` to use Codex instead of Claude.'
      })
      return
    }
    if (choices.length === 0) {
      await this.post(thread, { text: 'Your Markov desktop has no projects yet. Add one in Markov and try again.' })
      return
    }
    if (chosen || choices.length === 1) {
      await this.launch(thread, user, chosen ?? choices[0]!, agent, prompt)
      return
    }
    const pendingId = await this.deps.conversations.savePendingStart({
      conversation: thread.conversation,
      userId: machines[0]!.userId,
      chatUserId: user.id,
      route: thread.route,
      agent,
      prompt
    })
    await this.post(thread, {
      text: 'Which project should I use? Next time you can start your message with the project name.',
      actions: {
        kind: 'project',
        buttons: choices.slice(0, MAX_PROJECT_CHOICES).map((choice) => ({
          label: machines.length > 1 ? `${choice.project.name} (${choice.machine.hostName})` : choice.project.name,
          value: JSON.stringify({ s: pendingId, m: choice.machine.machineId, p: choice.project.placeId })
        }))
      }
    })
  }

  private async launch(
    thread: ChatThread,
    user: ChatUser,
    choice: ProjectChoice,
    requestedAgent: string | null,
    prompt: string
  ): Promise<void> {
    const offered = choice.machine.hello?.agents ?? []
    const agent = requestedAgent ?? (offered.includes('claude') ? 'claude' : offered[0])
    if (!agent || !offered.includes(agent)) {
      await this.post(thread, { text: `That Markov desktop doesn't offer ${agentName(requestedAgent ?? 'an agent')}.` })
      return
    }
    const created = await this.deps.conversations.create({
      key: choice.machine,
      conversation: thread.conversation,
      chatUserId: user.id,
      route: thread.route,
      agent,
      projectName: choice.project.name
    })
    if (!created) return
    await this.deps.deliveries.enqueue(choice.machine, thread.conversation, {
      kind: 'start',
      agent,
      placeId: choice.project.placeId,
      prompt
    })
    this.deps.waiters.wake(choice.machine)
    await this.post(thread, {
      text: `Starting ${agentName(agent)} in **${choice.project.name}** on ${choice.machine.hostName ?? 'your desktop'}…`
    })
  }

  private async chooseProject(user: ChatUser, value: string, thread: ChatThread, messageId: string): Promise<void> {
    const choice = parseJson<{ s?: unknown; m?: unknown; p?: unknown }>(value)
    if (typeof choice?.s !== 'string' || typeof choice.m !== 'string' || typeof choice.p !== 'string') return
    const pending = await this.deps.conversations.takePendingStart(choice.s, user.id)
    if (!pending) return
    const machine = await this.deps.machines.get({ userId: pending.userId, machineId: choice.m })
    const project = machine?.hello?.projects.find((candidate) => candidate.placeId === choice.p)
    if (!machine || !project) {
      await this.post(thread, { text: 'That project is no longer available. Mention me again to start over.' })
      return
    }
    await this.update(thread, messageId, { text: `Project: **${project.name}**` })
    await this.launch(thread, user, { machine, project }, pending.agent, pending.prompt)
  }

  private async answerPrompt(
    record: ConversationRecord | null,
    user: ChatUser,
    value: string,
    thread: ChatThread,
    messageId: string
  ): Promise<void> {
    const answer = parseJson<{ p?: unknown; o?: unknown }>(value)
    if (!record || typeof answer?.p !== 'string' || typeof answer.o !== 'string') return
    if (record.chatUserId !== user.id) {
      await this.post(thread, { text: 'Only the person who started this conversation can answer.' })
      return
    }
    const stored = await this.deps.conversations.latestPrompt(record.conversation, answer.p)
    if (!stored || stored.prompt.kind === 'unsupported') return
    const option = stored.prompt.options.find((candidate) => candidate.id === answer.o)
    if (!option || !(await this.deps.conversations.claimPromptAnswer(record.conversation, answer.p))) return
    await this.enqueue(record, { kind: 'answer', promptId: answer.p, optionId: answer.o })
    const original = promptMessage(record, stored.prompt)
    await this.update(thread, messageId, { text: `${original.text}\n\nAnswered: **${option.label.trim() || option.id}**` })
  }

  async onDeliveryDone(delivery: StoredDelivery): Promise<void> {
    const record = await this.deps.conversations.get(delivery.conversation)
    if (!ownedBy(record, delivery) || !delivery.result) return
    const result = delivery.result
    const isStart = delivery.body.kind === 'start'
    let text: string | null = null
    if (result.outcome === 'refused') {
      text = `${isStart ? "Markov couldn't start the agent" : "Markov couldn't deliver that"} (${result.reason}).`
    } else if (result.outcome === 'expired') {
      text = "Your Markov desktop didn't pick this up in time. Is it open, signed in, and online?"
    } else if (result.outcome === 'unknown') {
      text = `Markov lost track of this request (${result.reason}).`
    } else if (result.outcome === 'unsupported') {
      text = "This Markov desktop doesn't support that yet."
    }
    if (text) await this.post(threadOf(record), { text })
    // A start that never ran leaves the thread free for a fresh request.
    if (isStart && result.outcome !== 'accepted') await this.deps.conversations.remove(record.conversation)
  }

  async onEvents(key: MachineKey, events: ConnectorEvent[]): Promise<void> {
    for (const event of events) {
      if (event.kind === 'snapshot') {
        for (const entry of event.conversations) {
          const record = await this.deps.conversations.get(entry.conversation)
          if (!ownedBy(record, key)) continue
          await this.deps.conversations.linkPane(entry.conversation, entry.paneKey, entry.agent)
          if (entry.turnId !== undefined) await this.deps.conversations.noteTurnStarted(entry.conversation, entry.turnId)
          if (entry.prompt) await this.showPrompt(record, entry.paneKey, entry.prompt)
        }
        continue
      }
      const record = await this.deps.conversations.get(event.conversation)
      if (!ownedBy(record, key)) continue
      if (event.kind === 'linked') {
        await this.deps.conversations.linkPane(event.conversation, event.paneKey, event.agent)
      } else if (event.kind === 'prompt') {
        await this.showPrompt(record, event.paneKey, event.prompt)
      } else if (event.kind === 'turn-started') {
        await this.deps.conversations.noteTurnStarted(event.conversation, event.at)
      } else if (await this.deps.conversations.noteTurnEnded(event.conversation, event.turnId)) {
        await this.finishTurn(record, event.turnId, event.stopReason, event.lastAssistantMessage)
      }
    }
  }

  private async showPrompt(record: ConversationRecord, paneKey: string, prompt: ConnectorPendingPrompt) {
    if (!(await this.deps.conversations.recordPrompt(record.conversation, paneKey, prompt))) return
    const messageId = await this.post(threadOf(record), promptMessage(record, prompt))
    if (messageId) await this.deps.conversations.setPromptMessage(record.conversation, prompt.promptId, messageId)
  }

  private async finishTurn(
    record: ConversationRecord,
    turnId: number,
    stopReason: string | null,
    lastAssistantMessage: string | undefined
  ): Promise<void> {
    const thread = threadOf(record)
    for (const open of await this.deps.conversations.closeOpenPrompts(record.conversation)) {
      await this.update(thread, open.messageId, { text: 'No longer waiting for an answer.' })
    }
    const message = lastAssistantMessage?.trim()
    const repeated = record.lastReplyTurnId === turnId && record.lastReplyText?.trim() === message
    const note = stopReason ? STOP_REASONS[stopReason] : undefined
    const parts = [message && !repeated ? message : undefined, note ? `_${note}_` : undefined].filter(Boolean)
    if (parts.length > 0) await this.post(thread, { text: parts.join('\n\n') })
  }

  async onReply(
    key: MachineKey,
    request: ConnectorReplyRequest
  ): Promise<ConnectorReplyResponse | 'not_this_hosts_thread' | 'unavailable'> {
    const record = await this.deps.conversations.get(request.conversation)
    if (!ownedBy(record, key)) return 'not_this_hosts_thread'
    const existing = await this.deps.conversations.findReply(request.replyId, key)
    if (existing) return { status: 'posted', messageId: existing }
    if (!this.deps.chat) return 'unavailable'
    let messageId: string
    try {
      messageId = await this.deps.chat.post(threadOf(record), { text: request.text })
    } catch (error) {
      console.warn(JSON.stringify({ event: 'markov_connector_reply_failed', message: String(error) }))
      return 'unavailable'
    }
    await this.deps.conversations.recordReply(request.replyId, key, messageId)
    await this.deps.conversations.noteReply(request.conversation, request.turnId, request.text)
    return { status: 'posted', messageId }
  }
}

function parseJson<T>(value: string): T | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  } catch {
    return null
  }
}
