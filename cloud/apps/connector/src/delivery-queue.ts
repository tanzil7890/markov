import { randomBytes } from 'node:crypto'
import type { CloudDatabase, SqlRow } from '@markov-cloud/cloud-database'
import {
  CONNECTOR_LIMITS,
  type ConnectorConversation,
  type ConnectorDelivery,
  type ConnectorDeliveryResult
} from '@markov-cloud/connector-contract'
import type { MachineKey } from './machine-store.js'
import { rowNumber, rowOptionalNumber, rowOptionalString, rowString } from './sql-row.js'

export type DeliveryBody =
  | { kind: 'start'; agent: string; placeId: string; prompt: string }
  | { kind: 'send'; text: string }
  | { kind: 'answer'; promptId: string; optionId: string }
  | { kind: 'cancel' }

export type DeliveryState = 'queued' | 'leased' | 'received' | 'done'

export type StoredDelivery = MachineKey & {
  deliveryId: string
  conversation: ConnectorConversation
  seq: number
  body: DeliveryBody
  state: DeliveryState
  leaseUntil: number | null
  expiresAt: number
  result: ConnectorDeliveryResult | null
}

export type DeliveryAck =
  | { deliveryId: string; step: 'received' }
  | { deliveryId: string; step: 'done'; result: ConnectorDeliveryResult }

function deliveryFromRow(row: SqlRow): StoredDelivery {
  const resultJson = rowOptionalString(row.result_json)
  return {
    userId: rowString(row.user_id),
    machineId: rowString(row.machine_id),
    deliveryId: rowString(row.delivery_id),
    conversation: {
      source: rowString(row.source) as ConnectorConversation['source'],
      externalId: rowString(row.external_id)
    },
    seq: rowNumber(row.seq),
    body: JSON.parse(rowString(row.body_json)) as DeliveryBody,
    state: rowString(row.state) as DeliveryState,
    leaseUntil: rowOptionalNumber(row.lease_until),
    expiresAt: rowNumber(row.expires_at),
    result: resultJson ? (JSON.parse(resultJson) as ConnectorDeliveryResult) : null
  }
}

export function wireDelivery(delivery: StoredDelivery): ConnectorDelivery {
  return {
    deliveryId: delivery.deliveryId,
    seq: delivery.seq,
    expiresAt: delivery.expiresAt,
    conversation: delivery.conversation,
    ...delivery.body
  } as ConnectorDelivery
}

function conversationKey(conversation: ConnectorConversation): string {
  return `${conversation.source}\u0000${conversation.externalId}`
}

export class DeliveryQueue {
  constructor(
    private readonly database: CloudDatabase,
    private readonly now: () => number
  ) {}

  async enqueue(key: MachineKey, conversation: ConnectorConversation, body: DeliveryBody): Promise<StoredDelivery> {
    const now = this.now()
    const deliveryId = `dlv_${randomBytes(16).toString('base64url')}`
    return await this.database.transaction(async (transaction) => {
      const seqRows = await transaction.query(
        `UPDATE connector_machines SET delivery_seq = delivery_seq + 1
         WHERE user_id = ? AND machine_id = ? RETURNING delivery_seq`,
        [key.userId, key.machineId]
      )
      if (!seqRows[0]) throw new Error('connector machine is not registered')
      const rows = await transaction.query(
        `INSERT INTO connector_deliveries
           (delivery_id, user_id, machine_id, source, external_id, seq, kind, body_json, state, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
         RETURNING *`,
        [
          deliveryId,
          key.userId,
          key.machineId,
          conversation.source,
          conversation.externalId,
          rowNumber(seqRows[0].delivery_seq),
          body.kind,
          JSON.stringify(body),
          now + CONNECTOR_LIMITS.deliveryTtlMs,
          now
        ]
      )
      return deliveryFromRow(rows[0]!)
    })
  }

  // Hands out queued deliveries and leases that lapsed without a receipt, oldest first. A conversation's
  // later delivery waits while an earlier one is out unreceived, so a send never overtakes its start.
  async leaseBatch(key: MachineKey): Promise<StoredDelivery[]> {
    const now = this.now()
    return await this.database.transaction(async (transaction) => {
      const rows = await transaction.query(
        `SELECT * FROM connector_deliveries
         WHERE user_id = ? AND machine_id = ? AND state IN ('queued', 'leased')
         ORDER BY seq`,
        [key.userId, key.machineId]
      )
      const blocked = new Set<string>()
      const batch: StoredDelivery[] = []
      for (const row of rows) {
        const delivery = deliveryFromRow(row)
        const conversation = conversationKey(delivery.conversation)
        if (blocked.has(conversation)) continue
        if (delivery.expiresAt <= now) {
          blocked.add(conversation)
          continue
        }
        if (delivery.state === 'leased' && (delivery.leaseUntil ?? 0) > now) {
          blocked.add(conversation)
          continue
        }
        batch.push(delivery)
        if (batch.length >= CONNECTOR_LIMITS.maxDeliveriesPerPoll) break
      }
      for (const delivery of batch) {
        await transaction.query(
          `UPDATE connector_deliveries SET state = 'leased', lease_until = ?
           WHERE delivery_id = ? AND state IN ('queued', 'leased')`,
          [now + CONNECTOR_LIMITS.leaseMs, delivery.deliveryId]
        )
      }
      return batch
    })
  }

  async unsettled(key: MachineKey): Promise<Array<{ deliveryId: string; conversation: ConnectorConversation }>> {
    const rows = await this.database.query(
      `SELECT * FROM connector_deliveries
       WHERE user_id = ? AND machine_id = ? AND state = 'received' ORDER BY seq`,
      [key.userId, key.machineId]
    )
    return rows.map(deliveryFromRow).map((delivery) => ({
      deliveryId: delivery.deliveryId,
      conversation: delivery.conversation
    }))
  }

  // Idempotent: a receipt after done changes nothing, and the first done wins. Returns the delivery
  // only when this ack settled it.
  async applyAck(key: MachineKey, ack: DeliveryAck): Promise<StoredDelivery | null> {
    if (ack.step === 'received') {
      await this.database.query(
        `UPDATE connector_deliveries SET state = 'received', lease_until = NULL
         WHERE delivery_id = ? AND user_id = ? AND machine_id = ? AND state IN ('queued', 'leased')`,
        [ack.deliveryId, key.userId, key.machineId]
      )
      return null
    }
    const rows = await this.database.query(
      `UPDATE connector_deliveries SET state = 'done', result_json = ?, settled_at = ?, lease_until = NULL
       WHERE delivery_id = ? AND user_id = ? AND machine_id = ? AND state <> 'done'
       RETURNING *`,
      [JSON.stringify(ack.result), this.now(), ack.deliveryId, key.userId, key.machineId]
    )
    return rows[0] ? deliveryFromRow(rows[0]) : null
  }

  // Deliveries never received in time are settled as expired; returns them so the chat can say so.
  async expireOverdue(): Promise<StoredDelivery[]> {
    const now = this.now()
    const rows = await this.database.query(
      `UPDATE connector_deliveries SET state = 'done', result_json = ?, settled_at = ?, lease_until = NULL
       WHERE state IN ('queued', 'leased') AND expires_at + ? <= ?
       RETURNING *`,
      [JSON.stringify({ outcome: 'expired' }), now, CONNECTOR_LIMITS.leasedExpiryGraceMs, now]
    )
    return rows.map(deliveryFromRow)
  }

  async deleteSettledBefore(cutoff: number): Promise<void> {
    await this.database.query("DELETE FROM connector_deliveries WHERE state = 'done' AND settled_at < ?", [cutoff])
  }
}
