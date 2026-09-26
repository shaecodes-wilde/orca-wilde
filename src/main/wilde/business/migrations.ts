import { randomUUID } from 'node:crypto'
import type SyncDatabase from '../../sqlite/sync-database'

export const SCHEMA_VERSION = 1
export function migrateBusinessDatabase(db: SyncDatabase, file: string): void {
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 3000')
  const version = Number(db.pragma('user_version', { simple: true }))
  if (version > SCHEMA_VERSION) {
    throw new Error('This business database requires a newer app. Workspaces remain available.')
  }
  if (db.pragma('quick_check', { simple: true }) !== 'ok') {
    throw new Error(
      'Business database integrity failed. Restore a verified backup; the original has been preserved.'
    )
  }
  if (version === SCHEMA_VERSION) {
    return
  }
  if (version > 0) {
    db.prepare('VACUUM INTO ?').run(`${file}.before-v${SCHEMA_VERSION}-${Date.now()}`)
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE records (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT REFERENCES records(id) DEFERRABLE INITIALLY DEFERRED,
        project_id TEXT, revision INTEGER NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)),
        unique_key TEXT UNIQUE, UNIQUE(id, client_id),
        FOREIGN KEY(project_id, client_id) REFERENCES records(id, client_id) DEFERRABLE INITIALLY DEFERRED
      );
      CREATE INDEX records_scope ON records(client_id, kind);
      CREATE TABLE history (sequence INTEGER PRIMARY KEY, entity_id TEXT NOT NULL, client_id TEXT,
        at TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE TABLE activity (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, operation TEXT NOT NULL,
        entity_id TEXT NOT NULL, client_id TEXT, at TEXT NOT NULL);
      CREATE TABLE requests (id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE checkpoints (id TEXT PRIMARY KEY, body TEXT NOT NULL CHECK(json_valid(body)));
      PRAGMA user_version = 1;
    `)
    db.prepare('INSERT INTO metadata VALUES (?, ?)').run('ownerId', randomUUID())
    db.prepare('INSERT INTO metadata VALUES (?, ?)').run('revision', '0')
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
