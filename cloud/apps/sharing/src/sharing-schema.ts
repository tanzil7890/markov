// Applied to both dialects; a bound Buffer lands in BYTEA as binary in PostgreSQL and a BLOB in SQLite.
const SHARING_SCHEMA = `
CREATE TABLE IF NOT EXISTS sharing_files (
  file_key TEXT PRIMARY KEY,
  byte_size BIGINT NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sharing_file_chunks (
  file_key TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  bytes BYTEA NOT NULL,
  PRIMARY KEY(file_key, chunk_index)
);

CREATE TABLE IF NOT EXISTS sharing_artifacts (
  slug TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  create_key_hash TEXT NOT NULL,
  create_response TEXT NOT NULL,
  edit_salt TEXT NOT NULL,
  edit_token_hash TEXT NOT NULL,
  content_key TEXT NOT NULL,
  title TEXT,
  original_file_name TEXT,
  source_content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  deleted_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS sharing_artifacts_create_key
  ON sharing_artifacts(owner_user_id, create_key_hash);
CREATE INDEX IF NOT EXISTS sharing_artifacts_owner ON sharing_artifacts(owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS sharing_artifacts_expiry ON sharing_artifacts(expires_at);

CREATE TABLE IF NOT EXISTS sharing_skill_packages (
  package_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  deleted_at BIGINT
);
CREATE INDEX IF NOT EXISTS sharing_skill_packages_owner ON sharing_skill_packages(owner_user_id, name);

CREATE TABLE IF NOT EXISTS sharing_skill_versions (
  package_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  package_digest TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL,
  compressed_bytes BIGINT NOT NULL,
  archive_key TEXT NOT NULL,
  release_notes TEXT NOT NULL,
  manifest TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(package_id, version_id)
);

CREATE TABLE IF NOT EXISTS sharing_skill_uploads (
  upload_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  create_key_hash TEXT NOT NULL,
  token_salt TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expected_sha256 TEXT NOT NULL,
  expected_bytes BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  uploaded_at BIGINT,
  finalized_at BIGINT,
  package_id TEXT,
  version_id TEXT,
  created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sharing_skill_uploads_create_key
  ON sharing_skill_uploads(owner_user_id, create_key_hash);
CREATE INDEX IF NOT EXISTS sharing_skill_uploads_expiry ON sharing_skill_uploads(expires_at);
CREATE INDEX IF NOT EXISTS sharing_skill_uploads_package ON sharing_skill_uploads(package_id);

CREATE TABLE IF NOT EXISTS sharing_skill_shares (
  share_id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  create_key_hash TEXT NOT NULL,
  pinned_version_id TEXT,
  created_at BIGINT NOT NULL,
  revoked_at BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS sharing_skill_shares_create_key
  ON sharing_skill_shares(owner_user_id, create_key_hash);
CREATE INDEX IF NOT EXISTS sharing_skill_shares_package ON sharing_skill_shares(package_id);

CREATE TABLE IF NOT EXISTS sharing_skill_grants (
  token_hash TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  share_id TEXT,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sharing_skill_grants_expiry ON sharing_skill_grants(expires_at);
CREATE INDEX IF NOT EXISTS sharing_skill_grants_package ON sharing_skill_grants(package_id);
`

export function sharingSchemaStatements(): string[] {
  return SHARING_SCHEMA.split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}
