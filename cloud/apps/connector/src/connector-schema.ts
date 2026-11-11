import { openCloudDatabase, openInMemoryCloudDatabase, type CloudDatabase } from '@markov-cloud/cloud-database'

// Timestamps are epoch ms in BIGINT columns; JSON travels as TEXT so SQLite and PostgreSQL agree.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS connector_machines (
  user_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  email TEXT NOT NULL,
  hello_rev BIGINT NOT NULL DEFAULT 0,
  events_seq BIGINT NOT NULL DEFAULT -1,
  unsettled_listed BIGINT NOT NULL DEFAULT 0,
  delivery_seq BIGINT NOT NULL DEFAULT 0,
  host_name TEXT,
  hello_json TEXT,
  hello_at BIGINT,
  seen_at BIGINT,
  PRIMARY KEY (user_id, machine_id)
);
CREATE INDEX IF NOT EXISTS connector_machines_email ON connector_machines (email);
CREATE TABLE IF NOT EXISTS connector_conversations (
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  chat_user_id TEXT NOT NULL,
  route_json TEXT NOT NULL,
  agent TEXT NOT NULL,
  project_name TEXT NOT NULL,
  pane_key TEXT,
  turn_started_at BIGINT,
  ended_turn_id BIGINT,
  pending_prompt_id TEXT,
  last_reply_turn_id BIGINT,
  last_reply_text TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (source, external_id)
);
CREATE TABLE IF NOT EXISTS connector_deliveries (
  delivery_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  seq BIGINT NOT NULL,
  kind TEXT NOT NULL,
  body_json TEXT NOT NULL,
  state TEXT NOT NULL,
  lease_until BIGINT,
  expires_at BIGINT NOT NULL,
  result_json TEXT,
  created_at BIGINT NOT NULL,
  settled_at BIGINT
);
CREATE INDEX IF NOT EXISTS connector_deliveries_machine ON connector_deliveries (user_id, machine_id, state, seq);
CREATE TABLE IF NOT EXISTS connector_prompts (
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  pane_key TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  message_id TEXT,
  answered BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (source, external_id, pane_key, prompt_id)
);
CREATE TABLE IF NOT EXISTS connector_replies (
  reply_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS connector_pending_starts (
  pending_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  chat_user_id TEXT NOT NULL,
  route_json TEXT NOT NULL,
  agent TEXT,
  prompt TEXT NOT NULL,
  created_at BIGINT NOT NULL
)
`

export function connectorSchemaStatements(): string[] {
  return SCHEMA.split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

export async function openConnectorDatabase(input: {
  databaseUrl?: string
  dataDir: string
  poolMax: number
}): Promise<CloudDatabase> {
  return await openCloudDatabase({
    service: 'connector',
    schemaStatements: connectorSchemaStatements(),
    ...(input.databaseUrl ? { databaseUrl: input.databaseUrl } : {}),
    dataDir: input.dataDir,
    poolMax: input.poolMax,
    applicationName: 'markov-connector'
  })
}

export async function openInMemoryConnectorDatabase(): Promise<CloudDatabase> {
  return await openInMemoryCloudDatabase(connectorSchemaStatements())
}
