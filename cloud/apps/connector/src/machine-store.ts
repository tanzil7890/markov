import type { CloudDatabase, SqlRow } from '@markov-cloud/cloud-database'
import type { ConnectorHelloRequest } from '@markov-cloud/connector-contract'
import { rowNumber, rowOptionalNumber, rowOptionalString, rowString } from './sql-row.js'

export type MachineKey = { userId: string; machineId: string }

export type MachineRecord = MachineKey & {
  email: string
  helloRev: number
  eventsSeq: number
  unsettledListed: boolean
  hostName: string | null
  hello: ConnectorHelloRequest | null
  seenAt: number | null
}

export function machineKeyString(key: MachineKey): string {
  return `${key.userId}\u0000${key.machineId}`
}

function machineFromRow(row: SqlRow): MachineRecord {
  const helloJson = rowOptionalString(row.hello_json)
  return {
    userId: rowString(row.user_id),
    machineId: rowString(row.machine_id),
    email: rowString(row.email),
    helloRev: rowNumber(row.hello_rev),
    eventsSeq: rowNumber(row.events_seq),
    unsettledListed: rowNumber(row.unsettled_listed) === 1,
    hostName: rowOptionalString(row.host_name),
    hello: helloJson ? (JSON.parse(helloJson) as ConnectorHelloRequest) : null,
    seenAt: rowOptionalNumber(row.seen_at)
  }
}

export class MachineStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly now: () => number
  ) {}

  // Each hello gets a revision above every earlier one, durable across restarts, and resets the events mark.
  async recordHello(key: MachineKey, email: string, hello: ConnectorHelloRequest): Promise<number> {
    const now = this.now()
    const rows = await this.database.query(
      `INSERT INTO connector_machines
         (user_id, machine_id, email, hello_rev, events_seq, unsettled_listed, host_name, hello_json, hello_at, seen_at)
       VALUES (?, ?, ?, 1, -1, 0, ?, ?, ?, ?)
       ON CONFLICT (user_id, machine_id) DO UPDATE SET
         email = excluded.email,
         hello_rev = connector_machines.hello_rev + 1,
         events_seq = -1,
         unsettled_listed = 0,
         host_name = excluded.host_name,
         hello_json = excluded.hello_json,
         hello_at = excluded.hello_at,
         seen_at = excluded.seen_at
       RETURNING hello_rev`,
      [key.userId, key.machineId, email, hello.hostName, JSON.stringify(hello), now, now]
    )
    return rowNumber(rows[0]?.hello_rev)
  }

  async get(key: MachineKey): Promise<MachineRecord | null> {
    const rows = await this.database.query(
      'SELECT * FROM connector_machines WHERE user_id = ? AND machine_id = ?',
      [key.userId, key.machineId]
    )
    return rows[0] ? machineFromRow(rows[0]) : null
  }

  async touch(key: MachineKey): Promise<void> {
    await this.database.query('UPDATE connector_machines SET seen_at = ? WHERE user_id = ? AND machine_id = ?', [
      this.now(),
      key.userId,
      key.machineId
    ])
  }

  // True for exactly one caller per hello: the first poll lists what is unsettled.
  async claimUnsettledListing(key: MachineKey, helloRev: number): Promise<boolean> {
    const rows = await this.database.query(
      `UPDATE connector_machines SET unsettled_listed = 1
       WHERE user_id = ? AND machine_id = ? AND hello_rev = ? AND unsettled_listed = 0
       RETURNING hello_rev`,
      [key.userId, key.machineId, helloRev]
    )
    return rows.length > 0
  }

  async advanceEventsSeq(key: MachineKey, helloRev: number, seq: number): Promise<void> {
    await this.database.query(
      `UPDATE connector_machines SET events_seq = ?
       WHERE user_id = ? AND machine_id = ? AND hello_rev = ? AND events_seq < ?`,
      [seq, key.userId, key.machineId, helloRev, seq]
    )
  }

  // Machines whose owner signed in with this email, most recently seen first.
  async machinesForEmail(email: string): Promise<MachineRecord[]> {
    const rows = await this.database.query(
      `SELECT * FROM connector_machines
       WHERE lower(email) = lower(?) AND hello_json IS NOT NULL
       ORDER BY seen_at DESC`,
      [email]
    )
    return rows.map(machineFromRow)
  }
}
