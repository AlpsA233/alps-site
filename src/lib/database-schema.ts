import type { Client } from "@libsql/client";

// Kept free of server-only and application seeding so migration scripts can reuse it.
export const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id = 1), data TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('project','post')), slug TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(kind, slug))",
  "CREATE INDEX IF NOT EXISTS idx_entries_kind_status ON entries(kind, status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_published_projects_catalog ON entries(json_extract(data, '$.year') DESC, created_at DESC, id ASC) WHERE kind = 'project' AND status = 'published'",
  "CREATE INDEX IF NOT EXISTS idx_published_posts_catalog ON entries(json_extract(data, '$.year') DESC, created_at DESC, id ASC) WHERE kind = 'post' AND status = 'published'",
  "CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY CHECK(id = 1), count INTEGER NOT NULL, started_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS migrations (key TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
] as const;

export async function createSchema(client: Client): Promise<void> {
  await client.batch([...SCHEMA_STATEMENTS], "write");
}
