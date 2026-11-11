import { randomBytes } from 'node:crypto'
import type { CloudDatabase, SqlRow } from '@markov-cloud/cloud-database'
import type { ConnectorConversation, ConnectorPendingPrompt } from '@markov-cloud/connector-contract'
import type { ChatRoute } from './chat/chat-platform.js'
import type { MachineKey } from './machine-store.js'
import { rowNumber, rowOptionalNumber, rowOptionalString, rowString } from './sql-row.js'

export type ConversationRecord = MachineKey & {
  conversation: ConnectorConversation
  chatUserId: string
  route: ChatRoute
  agent: string
  projectName: string
  paneKey: string | null
  turnStartedAt: number | null
  endedTurnId: number | null
  lastReplyTurnId: number | null
  lastReplyText: string | null
}

export type StoredPrompt = {
  paneKey: string
  prompt: ConnectorPendingPrompt
  messageId: string | null
  answered: boolean
}

export type PendingStart = {
  pendingId: string
  conversation: ConnectorConversation
  userId: string
  chatUserId: string
  route: ChatRoute
  agent: string | null
  prompt: string
}

const PENDING_START_TTL_MS = 30 * 60_000

function conversationFromRow(row: SqlRow): ConversationRecord {
  return {
    userId: rowString(row.user_id),
    machineId: rowString(row.machine_id),
    conversation: {
      source: rowString(row.source) as ConnectorConversation['source'],
      externalId: rowString(row.external_id)
    },
    chatUserId: rowString(row.chat_user_id),
    route: JSON.parse(rowString(row.route_json)) as ChatRoute,
    agent: rowString(row.agent),
    projectName: rowString(row.project_name),
    paneKey: rowOptionalString(row.pane_key),
    turnStartedAt: rowOptionalNumber(row.turn_started_at),
    endedTurnId: rowOptionalNumber(row.ended_turn_id),
    lastReplyTurnId: rowOptionalNumber(row.last_reply_turn_id),
    lastReplyText: rowOptionalString(row.last_reply_text)
  }
}

export class ConversationStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly now: () => number
  ) {}

  async get(conversation: ConnectorConversation): Promise<ConversationRecord | null> {
    const rows = await this.database.query(
      'SELECT * FROM connector_conversations WHERE source = ? AND external_id = ?',
      [conversation.source, conversation.externalId]
    )
    return rows[0] ? conversationFromRow(rows[0]) : null
  }

  // Returns false when the thread already belongs to a conversation.
  async create(record: {
    key: MachineKey
    conversation: ConnectorConversation
    chatUserId: string
    route: ChatRoute
    agent: string
    projectName: string
  }): Promise<boolean> {
    const now = this.now()
    const rows = await this.database.query(
      `INSERT INTO connector_conversations
         (source, external_id, user_id, machine_id, chat_user_id, route_json, agent, project_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING source`,
      [
        record.conversation.source,
        record.conversation.externalId,
        record.key.userId,
        record.key.machineId,
        record.chatUserId,
        JSON.stringify(record.route),
        record.agent,
        record.projectName,
        now,
        now
      ]
    )
    return rows.length > 0
  }

  async remove(conversation: ConnectorConversation): Promise<void> {
    await this.database.query('DELETE FROM connector_conversations WHERE source = ? AND external_id = ?', [
      conversation.source,
      conversation.externalId
    ])
  }

  async linkPane(conversation: ConnectorConversation, paneKey: string, agent: string): Promise<void> {
    await this.database.query(
      `UPDATE connector_conversations SET pane_key = ?, agent = ?, updated_at = ?
       WHERE source = ? AND external_id = ?`,
      [paneKey, agent, this.now(), conversation.source, conversation.externalId]
    )
  }

  // Only a newer turn moves the conversation forward.
  async noteTurnStarted(conversation: ConnectorConversation, at: number): Promise<boolean> {
    const rows = await this.database.query(
      `UPDATE connector_conversations SET turn_started_at = ?, updated_at = ?
       WHERE source = ? AND external_id = ? AND (turn_started_at IS NULL OR turn_started_at < ?)
       RETURNING source`,
      [at, this.now(), conversation.source, conversation.externalId, at]
    )
    return rows.length > 0
  }

  // A turn ends once; an end older than the latest started turn changes nothing.
  async noteTurnEnded(conversation: ConnectorConversation, turnId: number): Promise<boolean> {
    const rows = await this.database.query(
      `UPDATE connector_conversations SET ended_turn_id = ?, turn_started_at = ?, updated_at = ?
       WHERE source = ? AND external_id = ?
         AND (ended_turn_id IS NULL OR ended_turn_id < ?)
         AND (turn_started_at IS NULL OR turn_started_at <= ?)
       RETURNING source`,
      [turnId, turnId, this.now(), conversation.source, conversation.externalId, turnId, turnId]
    )
    return rows.length > 0
  }

  async noteReply(conversation: ConnectorConversation, turnId: number, text: string): Promise<void> {
    await this.database.query(
      `UPDATE connector_conversations SET last_reply_turn_id = ?, last_reply_text = ?, updated_at = ?
       WHERE source = ? AND external_id = ?`,
      [turnId, text, this.now(), conversation.source, conversation.externalId]
    )
  }

  // True only for the first sighting of a prompt, so a resent event posts it once.
  async recordPrompt(
    conversation: ConnectorConversation,
    paneKey: string,
    prompt: ConnectorPendingPrompt
  ): Promise<boolean> {
    const rows = await this.database.query(
      `INSERT INTO connector_prompts (source, external_id, pane_key, prompt_id, prompt_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (source, external_id, pane_key, prompt_id) DO NOTHING
       RETURNING prompt_id`,
      [conversation.source, conversation.externalId, paneKey, prompt.promptId, JSON.stringify(prompt), this.now()]
    )
    return rows.length > 0
  }

  async setPromptMessage(conversation: ConnectorConversation, promptId: string, messageId: string): Promise<void> {
    await this.database.query(
      'UPDATE connector_prompts SET message_id = ? WHERE source = ? AND external_id = ? AND prompt_id = ?',
      [messageId, conversation.source, conversation.externalId, promptId]
    )
  }

  async latestPrompt(conversation: ConnectorConversation, promptId: string): Promise<StoredPrompt | null> {
    const rows = await this.database.query(
      `SELECT * FROM connector_prompts WHERE source = ? AND external_id = ? AND prompt_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [conversation.source, conversation.externalId, promptId]
    )
    const row = rows[0]
    if (!row) return null
    return {
      paneKey: rowString(row.pane_key),
      prompt: JSON.parse(rowString(row.prompt_json)) as ConnectorPendingPrompt,
      messageId: rowOptionalString(row.message_id),
      answered: rowNumber(row.answered) === 1
    }
  }

  // Answering is claimed once, so a double click sends one answer.
  async claimPromptAnswer(conversation: ConnectorConversation, promptId: string): Promise<boolean> {
    const rows = await this.database.query(
      `UPDATE connector_prompts SET answered = 1
       WHERE source = ? AND external_id = ? AND prompt_id = ? AND answered = 0
       RETURNING prompt_id`,
      [conversation.source, conversation.externalId, promptId]
    )
    return rows.length > 0
  }

  async closeOpenPrompts(conversation: ConnectorConversation): Promise<Array<{ promptId: string; messageId: string }>> {
    const rows = await this.database.query(
      `UPDATE connector_prompts SET answered = 1
       WHERE source = ? AND external_id = ? AND answered = 0 AND message_id IS NOT NULL
       RETURNING prompt_id, message_id`,
      [conversation.source, conversation.externalId]
    )
    return rows.map((row) => ({ promptId: rowString(row.prompt_id), messageId: rowString(row.message_id) }))
  }

  async findReply(replyId: string, key: MachineKey): Promise<string | null> {
    const rows = await this.database.query(
      'SELECT message_id FROM connector_replies WHERE reply_id = ? AND user_id = ? AND machine_id = ?',
      [replyId, key.userId, key.machineId]
    )
    return rows[0] ? rowString(rows[0].message_id) : null
  }

  async recordReply(replyId: string, key: MachineKey, messageId: string): Promise<void> {
    await this.database.query(
      `INSERT INTO connector_replies (reply_id, user_id, machine_id, message_id, created_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (reply_id) DO NOTHING`,
      [replyId, key.userId, key.machineId, messageId, this.now()]
    )
  }

  async savePendingStart(input: Omit<PendingStart, 'pendingId'>): Promise<string> {
    const pendingId = `pst_${randomBytes(12).toString('base64url')}`
    await this.database.query(
      `INSERT INTO connector_pending_starts
         (pending_id, source, external_id, user_id, chat_user_id, route_json, agent, prompt, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pendingId,
        input.conversation.source,
        input.conversation.externalId,
        input.userId,
        input.chatUserId,
        JSON.stringify(input.route),
        input.agent,
        input.prompt,
        this.now()
      ]
    )
    return pendingId
  }

  // Claims a project-choice request once, and only for the person who asked; a second click finds nothing.
  async takePendingStart(pendingId: string, chatUserId: string): Promise<PendingStart | null> {
    const rows = await this.database.query(
      `DELETE FROM connector_pending_starts
       WHERE pending_id = ? AND chat_user_id = ? AND created_at > ?
       RETURNING *`,
      [pendingId, chatUserId, this.now() - PENDING_START_TTL_MS]
    )
    const row = rows[0]
    if (!row) return null
    return {
      pendingId: rowString(row.pending_id),
      conversation: {
        source: rowString(row.source) as ConnectorConversation['source'],
        externalId: rowString(row.external_id)
      },
      userId: rowString(row.user_id),
      chatUserId: rowString(row.chat_user_id),
      route: JSON.parse(rowString(row.route_json)) as ChatRoute,
      agent: rowOptionalString(row.agent),
      prompt: rowString(row.prompt)
    }
  }

  async deleteStale(cutoff: number): Promise<void> {
    await this.database.query('DELETE FROM connector_pending_starts WHERE created_at < ?', [
      this.now() - PENDING_START_TTL_MS
    ])
    await this.database.query('DELETE FROM connector_replies WHERE created_at < ?', [cutoff])
  }
}
