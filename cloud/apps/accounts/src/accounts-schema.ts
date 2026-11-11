// Applied at startup for both dialects, so every column type must read the same in SQLite and PostgreSQL.
const ACCOUNTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts_users (
  user_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  synced_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_users_external ON accounts_users(provider, external_id);

CREATE TABLE IF NOT EXISTS accounts_memberships (
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  org_name TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY(user_id, org_id)
);

CREATE TABLE IF NOT EXISTS accounts_profiles (
  profile_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_profile_id TEXT,
  name TEXT,
  active_org_id TEXT,
  linked_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_profiles_local ON accounts_profiles(user_id, local_profile_id);

CREATE TABLE IF NOT EXISTS accounts_authorization_requests (
  request_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  state TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  local_profile_id TEXT,
  expires_at BIGINT NOT NULL,
  completed_at BIGINT
);
CREATE INDEX IF NOT EXISTS accounts_requests_expiry ON accounts_authorization_requests(expires_at);

CREATE TABLE IF NOT EXISTS accounts_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);
CREATE INDEX IF NOT EXISTS accounts_codes_expiry ON accounts_authorization_codes(expires_at);

CREATE TABLE IF NOT EXISTS accounts_sessions (
  session_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  access_hash TEXT NOT NULL,
  access_expires_at BIGINT NOT NULL,
  refresh_hash TEXT NOT NULL,
  refresh_expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  rotated_at BIGINT,
  revoked_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_sessions_access ON accounts_sessions(access_hash);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_sessions_refresh ON accounts_sessions(refresh_hash);
CREATE INDEX IF NOT EXISTS accounts_sessions_family ON accounts_sessions(family_id);
CREATE INDEX IF NOT EXISTS accounts_sessions_expiry ON accounts_sessions(refresh_expires_at);
`

export function accountsSchemaStatements(): string[] {
  return ACCOUNTS_SCHEMA.split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
