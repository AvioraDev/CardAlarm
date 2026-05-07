import Database from "better-sqlite3";
import path from "path";

// Resolve to the shared cardalarm.db one directory above /web
const DB_PATH = path.resolve(process.cwd(), "..", "cardalarm.db");

let _db: Database.Database | null = null;

/**
 * Singleton DB connection for the Next.js server process.
 * Points at the same cardalarm.db the engine writes to.
 * WAL mode allows concurrent reads while the engine writes.
 */
export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  ensureSchema(_db);
  return _db;
}

/**
 * Ensure tables the web process reads from exist.
 * The engine owns the full schema, but if it hasn't run yet
 * after a migration, these tables would be missing.
 */
function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      processed INTEGER DEFAULT 0,
      matched INTEGER DEFAULT 0,
      error TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );
  `);

  const migrations = [
    "ALTER TABLE listings_feed ADD COLUMN serial_current TEXT",
    "ALTER TABLE listings_feed ADD COLUMN serial_limit TEXT",
    "ALTER TABLE listings_feed ADD COLUMN match_confidence REAL",
    "ALTER TABLE listings_feed ADD COLUMN match_status TEXT",
    "ALTER TABLE listings_feed ADD COLUMN match_reasons TEXT",
    "ALTER TABLE listings_feed ADD COLUMN unmatched_fields TEXT",
    "ALTER TABLE listings_feed ADD COLUMN matcher_version TEXT",
  ];

  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists or listings_feed has not been created by the engine yet.
    }
  }
}
