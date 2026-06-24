import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(here, '..', 'data');
export const DB_PATH = process.env.ARSENAL_DB ?? join(DATA_DIR, 'arsenal.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema runs on import so any module that touches `db` finds the tables ready.
db.exec(`
CREATE TABLE IF NOT EXISTS entries (
  id          INTEGER PRIMARY KEY,
  type        TEXT NOT NULL,
  category    TEXT,
  subcategory TEXT,
  title       TEXT NOT NULL,
  body        TEXT,
  language    TEXT,
  locale      TEXT NOT NULL DEFAULT 'ru',   -- UI content language: 'ru' | 'en'
  tags        TEXT,                 -- JSON array of strings
  source      TEXT,
  meta        TEXT,                 -- JSON object
  is_custom   INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entries_type      ON entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_type_cat  ON entries(type, category);
CREATE INDEX IF NOT EXISTS idx_entries_favorite  ON entries(is_favorite);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  title, body, tags, category,
  content='entries', content_rowid='id', tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, title, body, tags, category)
  VALUES (new.id, new.title, new.body, new.tags, new.category);
END;
CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, body, tags, category)
  VALUES ('delete', old.id, old.title, old.body, old.tags, old.category);
END;
CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, title, body, tags, category)
  VALUES ('delete', old.id, old.title, old.body, old.tags, old.category);
  INSERT INTO entries_fts(rowid, title, body, tags, category)
  VALUES (new.id, new.title, new.body, new.tags, new.category);
END;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Checklist DEFINITIONS (seeded; wiped & reloaded on every re-seed).
CREATE TABLE IF NOT EXISTS checklists (
  slug       TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  category   TEXT,             -- maps to an existing payload category (cross-link), nullable
  sort       INTEGER NOT NULL DEFAULT 0,
  research   TEXT,             -- markdown companion (impact / CVE / tools / sources)
  sections   TEXT NOT NULL,    -- JSON: [{name, items:[{key, text}]}]
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User PROGRESS & notes — keyed by stable string. NEVER touched by the seed.
--   item state : key = "<slug>#<itemHash>"  → checked + optional per-item note
--   list note  : key = "note#<slug>"        → free-text note for the whole checklist
CREATE TABLE IF NOT EXISTS checklist_state (
  key        TEXT PRIMARY KEY,
  checked    INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Engagements (targets) + findings — per-target workspace (user data, never seeded; covered by backup).
CREATE TABLE IF NOT EXISTS targets (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  host       TEXT,
  lhost      TEXT,
  scope      TEXT,
  status     TEXT NOT NULL DEFAULT 'active',
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS findings (
  id         INTEGER PRIMARY KEY,
  target_id  INTEGER REFERENCES targets(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  severity   TEXT NOT NULL DEFAULT 'medium',
  url        TEXT,
  status     TEXT NOT NULL DEFAULT 'open',
  body       TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_findings_target ON findings(target_id);
`);

// Migration: add `locale` to entries on databases created before bilingual support.
{
  const cols = db.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'locale')) {
    db.exec("ALTER TABLE entries ADD COLUMN locale TEXT NOT NULL DEFAULT 'ru'");
  }
  // Created here (not in the schema block above) so it also works on pre-locale DBs,
  // where the column only exists after the ALTER right above.
  db.exec('CREATE INDEX IF NOT EXISTS idx_entries_locale ON entries(type, locale)');
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

/** Fold the WAL back into the main db file (keeps arsenal.db-wal from growing unbounded). */
export function checkpoint(): void {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
}
