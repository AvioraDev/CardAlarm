import Database from 'better-sqlite3';
import path from 'path';
import type {
  ChecklistRow,
  ListingInsert,
  ListingRow,
  WatchlistRow,
  ScanRunRow,
  ScanMode,
  SourceProductCacheInput,
  SourceProductCacheStatus,
  SourceProductRow,
} from './types';

const DB_PATH = path.resolve(__dirname, '..', '..', 'cardalarm.db');

let _db: Database.Database | null = null;

/**
 * Returns the singleton DB connection. Creates it on first call.
 * Accepts an optional path override for testing with :memory:.
 */
export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath ?? DB_PATH);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}

/**
 * Replace the singleton with an externally-created instance (for tests).
 */
export function setDb(db: Database.Database): void {
  _db = db;
  initSchema(_db);
}

/**
 * Close and clear the singleton. Safe to call multiple times.
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ─── Schema ────────────────────────────────────────────────────────

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reference_checklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER,
      set_name TEXT,
      card_number TEXT,
      player_name TEXT,
      UNIQUE(set_name, card_number)
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'shopify',
      country_code TEXT DEFAULT 'NZ',
      currency TEXT DEFAULT 'NZD',
      is_active INTEGER DEFAULT 1,
      scan_frequency_minutes INTEGER DEFAULT 15,
      last_successful_scan_at DATETIME,
      last_failed_scan_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS store_scan_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_slug TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      products_seen INTEGER DEFAULT 0,
      products_created INTEGER DEFAULT 0,
      products_updated INTEGER DEFAULT 0,
      products_marked_unavailable INTEGER DEFAULT 0,
      error_message TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      variants TEXT DEFAULT '',
      target_numbers TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS listings_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_id TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT,
      price REAL,
      url TEXT,
      image_url TEXT,
      match_type TEXT,
      is_dismissed INTEGER DEFAULT 0,
      is_oos INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(external_id, source)
    );

    CREATE TABLE IF NOT EXISTS source_products (
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      handle TEXT,
      title TEXT,
      price REAL,
      available INTEGER DEFAULT 0,
      url TEXT,
      image_url TEXT,
      description TEXT,
      normalized_title TEXT,
      content_hash TEXT NOT NULL,
      last_matched_hash TEXT,
      last_matched_context_hash TEXT,
      raw_latest_payload TEXT,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_scan_token TEXT,
      PRIMARY KEY(source, external_id)
    );

    CREATE TABLE IF NOT EXISTS product_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      scan_run_id INTEGER,
      title TEXT,
      description TEXT,
      price REAL,
      currency TEXT DEFAULT 'NZD',
      availability INTEGER,
      image_url TEXT,
      raw_payload TEXT,
      content_hash TEXT NOT NULL,
      observed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_card_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      checklist_id INTEGER,
      matched_player_name TEXT,
      confidence REAL NOT NULL,
      status TEXT NOT NULL,
      matched_fields TEXT,
      match_reasons TEXT,
      unmatched_fields TEXT,
      matcher_version TEXT,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, external_id, matcher_version)
    );

    CREATE TABLE IF NOT EXISTS watchlist_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      product_card_match_id INTEGER,
      confidence REAL NOT NULL,
      status TEXT NOT NULL,
      first_matched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_matched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(watchlist_id, source, external_id)
    );

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

  // ── Additive migrations for metadata columns ──
  // SQLite ALTER TABLE ADD COLUMN is safe: column becomes NULL for existing rows.
  const migrations = [
    'ALTER TABLE listings_feed ADD COLUMN year TEXT',
    'ALTER TABLE listings_feed ADD COLUMN set_name TEXT',
    'ALTER TABLE listings_feed ADD COLUMN card_number TEXT',
    'ALTER TABLE listings_feed ADD COLUMN player_name TEXT',
    'ALTER TABLE listings_feed ADD COLUMN variant TEXT',
    'ALTER TABLE listings_feed ADD COLUMN is_serial INTEGER DEFAULT 0',
    'ALTER TABLE listings_feed ADD COLUMN serial_number TEXT',
    'ALTER TABLE listings_feed ADD COLUMN is_auto INTEGER DEFAULT 0',
    'ALTER TABLE listings_feed ADD COLUMN is_rookie INTEGER DEFAULT 0',
    'ALTER TABLE listings_feed ADD COLUMN category TEXT',
    'ALTER TABLE listings_feed ADD COLUMN serial_current TEXT',
    'ALTER TABLE listings_feed ADD COLUMN serial_limit TEXT',
    'ALTER TABLE listings_feed ADD COLUMN match_confidence REAL',
    'ALTER TABLE listings_feed ADD COLUMN match_status TEXT',
    'ALTER TABLE listings_feed ADD COLUMN match_reasons TEXT',
    'ALTER TABLE listings_feed ADD COLUMN unmatched_fields TEXT',
    'ALTER TABLE listings_feed ADD COLUMN matcher_version TEXT',
    'ALTER TABLE source_products ADD COLUMN description TEXT',
    'ALTER TABLE source_products ADD COLUMN normalized_title TEXT',
    'ALTER TABLE source_products ADD COLUMN raw_latest_payload TEXT',
    'ALTER TABLE source_products ADD COLUMN last_checked_at DATETIME',
  ];

  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists — expected on subsequent runs
    }
  }

  // ── Indexes for filter performance ──
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_feed_year ON listings_feed(year)',
    'CREATE INDEX IF NOT EXISTS idx_feed_set ON listings_feed(set_name)',
    'CREATE INDEX IF NOT EXISTS idx_feed_player ON listings_feed(player_name)',
    'CREATE INDEX IF NOT EXISTS idx_feed_category ON listings_feed(category)',
    'CREATE INDEX IF NOT EXISTS idx_feed_active ON listings_feed(is_dismissed, is_oos)',
    'CREATE INDEX IF NOT EXISTS idx_feed_confidence ON listings_feed(match_status, match_confidence)',
    'CREATE INDEX IF NOT EXISTS idx_snapshots_product ON product_snapshots(source, external_id, observed_at)',
    'CREATE INDEX IF NOT EXISTS idx_product_matches_status ON product_card_matches(status, confidence)',
    'CREATE INDEX IF NOT EXISTS idx_watchlist_matches_watchlist ON watchlist_matches(watchlist_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_source_products_scan ON source_products(source, last_seen_scan_token)',
    'CREATE INDEX IF NOT EXISTS idx_source_products_available ON source_products(source, available)',
  ];

  for (const sql of indexes) {
    db.exec(sql);
  }
}

// ─── Source Product Cache ──────────────────────────────────────────

export function upsertSourceProducts(
  db: Database.Database,
  products: SourceProductCacheInput[],
  matchContextHash: string
): SourceProductCacheStatus[] {
  if (products.length === 0) return [];

  const source = products[0]!.source;
  const ids = products.map(product => product.externalId);
  const placeholders = ids.map(() => '?').join(', ');
  const existingRows = db
    .prepare(`
      SELECT source, external_id, content_hash, last_matched_hash, last_matched_context_hash
      FROM source_products
      WHERE source = ? AND external_id IN (${placeholders})
    `)
    .all(source, ...ids) as Pick<
      SourceProductRow,
      'source' | 'external_id' | 'content_hash' | 'last_matched_hash' | 'last_matched_context_hash'
    >[];

  const existingById = new Map(existingRows.map(row => [row.external_id, row]));

  const upsertStmt = db.prepare(`
    INSERT INTO source_products (
      source, external_id, handle, title, price, available, url, image_url,
      description, normalized_title, raw_latest_payload, content_hash, last_seen_scan_token,
      last_checked_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source, external_id) DO UPDATE SET
      handle = excluded.handle,
      title = excluded.title,
      price = excluded.price,
      available = excluded.available,
      url = excluded.url,
      image_url = excluded.image_url,
      description = excluded.description,
      normalized_title = excluded.normalized_title,
      raw_latest_payload = excluded.raw_latest_payload,
      content_hash = excluded.content_hash,
      last_seen_at = CURRENT_TIMESTAMP,
      last_checked_at = CURRENT_TIMESTAMP,
      last_seen_scan_token = excluded.last_seen_scan_token
  `);

  const snapshotStmt = db.prepare(`
    INSERT INTO product_snapshots (
      source, external_id, title, description, price, availability,
      image_url, raw_payload, content_hash
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const statuses: SourceProductCacheStatus[] = [];
  const writeBatch = db.transaction((batch: SourceProductCacheInput[]) => {
    for (const product of batch) {
      const existing = existingById.get(product.externalId);
      const isNew = !existing;
      const changed = existing?.content_hash !== product.contentHash;
      const alreadyMatched =
        existing?.last_matched_hash === product.contentHash &&
        existing?.last_matched_context_hash === matchContextHash;

      upsertStmt.run(
        product.source,
        product.externalId,
        product.handle,
        product.title,
        product.price,
        product.available ? 1 : 0,
        product.url,
        product.imageUrl,
        product.description,
        product.title.toLowerCase(),
        product.rawPayload,
        product.contentHash,
        product.scanToken
      );

      if (isNew || changed) {
        snapshotStmt.run(
          product.source,
          product.externalId,
          product.title,
          product.description,
          product.price,
          product.available ? 1 : 0,
          product.imageUrl,
          product.rawPayload,
          product.contentHash
        );
      }

      statuses.push({
        externalId: product.externalId,
        contentHash: product.contentHash,
        isNew,
        changed,
        shouldMatch: product.available && (isNew || changed || !alreadyMatched),
      });
    }
  });

  writeBatch(products);
  return statuses;
}

export function markSourceProductsMatched(
  db: Database.Database,
  source: string,
  matches: { externalId: string; contentHash: string }[],
  matchContextHash: string
): void {
  if (matches.length === 0) return;

  const stmt = db.prepare(`
    UPDATE source_products
    SET last_matched_hash = ?, last_matched_context_hash = ?
    WHERE source = ? AND external_id = ?
  `);

  const batch = db.transaction((rows: { externalId: string; contentHash: string }[]) => {
    for (const row of rows) {
      stmt.run(row.contentHash, matchContextHash, source, row.externalId);
    }
  });

  batch(matches);
}

export function markMissingSourceProductsOOS(
  db: Database.Database,
  source: string,
  scanToken: string
): number {
  const updateCache = db.prepare(`
    UPDATE source_products
    SET available = 0
    WHERE source = ? AND available = 1 AND last_seen_scan_token IS NOT ?
  `);
  const updateFeed = db.prepare(`
    UPDATE listings_feed
    SET is_oos = 1
    WHERE source = ?
      AND is_oos = 0
      AND external_id IN (
        SELECT external_id FROM source_products
        WHERE source = ? AND available = 0
      )
  `);

  const run = db.transaction(() => {
    updateCache.run(source, scanToken);
    return updateFeed.run(source, source).changes;
  });

  return run();
}

export function reconcileSourceAvailability(
  db: Database.Database,
  source: string,
  availableExternalIds: string[]
): number {
  const run = db.transaction((ids: string[]) => {
    db.exec('DROP TABLE IF EXISTS temp_available_products');
    db.exec('CREATE TEMP TABLE temp_available_products (external_id TEXT PRIMARY KEY)');

    const insertTemp = db.prepare('INSERT INTO temp_available_products (external_id) VALUES (?)');
    for (const id of ids) {
      insertTemp.run(id);
    }

    db.prepare(`
      UPDATE source_products
      SET available = CASE
        WHEN external_id IN (SELECT external_id FROM temp_available_products) THEN 1
        ELSE 0
      END
      WHERE source = ?
    `).run(source);

    const updatedFeed = db.prepare(`
      UPDATE listings_feed
      SET is_oos = 1
      WHERE source = ?
        AND is_oos = 0
        AND external_id NOT IN (SELECT external_id FROM temp_available_products)
    `).run(source).changes;

    db.exec('DROP TABLE temp_available_products');
    return updatedFeed;
  });

  return run(availableExternalIds);
}

// ─── Checklist Queries ─────────────────────────────────────────────

/**
 * Scoped lookup: find the player for a specific set + card number combo.
 * Returns null if no match. This is the high-precision Stealth Match path.
 */
export function getChecklistBySetAndNumber(
  db: Database.Database,
  setNameFragment: string,
  cardNumber: string
): ChecklistRow | undefined {
  // Use LIKE with the fragment embedded in the set_name column.
  // Real set names: "2023-24 Panini Prizm - Green Prizm" vs DB: "Base", "Silver", etc.
  // We match on card_number exactly and set_name containing the fragment.
  const stmt = db.prepare(`
    SELECT * FROM reference_checklists
    WHERE card_number = ? AND set_name LIKE ?
    LIMIT 1
  `);
  return stmt.get(cardNumber, `%${setNameFragment}%`) as ChecklistRow | undefined;
}

/**
 * Broad lookup: find ALL players across all sets for a given card number.
 * Used as fallback when set extraction fails. Returns multiple candidates.
 */
export function getChecklistByNumber(
  db: Database.Database,
  cardNumber: string
): ChecklistRow[] {
  const stmt = db.prepare(`
    SELECT * FROM reference_checklists
    WHERE card_number = ?
  `);
  return stmt.all(cardNumber) as ChecklistRow[];
}

export function getAllChecklistPlayerNames(db: Database.Database): string[] {
  const stmt = db.prepare(`
    SELECT DISTINCT player_name FROM reference_checklists
  `);
  const rows = stmt.all() as { player_name: string }[];
  return rows.map(r => r.player_name);
}

// ─── Watchlist Queries ─────────────────────────────────────────────

export function getActiveWatchlistPlayers(db: Database.Database): WatchlistRow[] {
  const stmt = db.prepare(`
    SELECT * FROM watchlist WHERE is_active = 1
  `);
  return stmt.all() as WatchlistRow[];
}

export function isPlayerOnWatchlist(db: Database.Database, playerName: string): boolean {
  const stmt = db.prepare(`
    SELECT 1 FROM watchlist
    WHERE player_name = ? COLLATE NOCASE AND is_active = 1
    LIMIT 1
  `);
  return stmt.get(playerName) !== undefined;
}

// ─── Listings Mutations ────────────────────────────────────────────

/**
 * INSERT OR IGNORE prevents duplicates on the (external_id, source) constraint.
 * Now writes all metadata columns extracted from the title.
 * Returns true if a new row was inserted.
 */
export function upsertListing(db: Database.Database, listing: ListingInsert): boolean {
  const stmt = db.prepare(`
    INSERT INTO listings_feed
      (external_id, source, title, price, url, image_url, match_type,
       year, set_name, card_number, player_name, variant,
       is_serial, serial_number, serial_current, serial_limit, is_auto, is_rookie, category,
       match_confidence, match_status, match_reasons, unmatched_fields, matcher_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(external_id, source) DO UPDATE SET
      is_oos = 0,
      price = excluded.price,
      title = excluded.title,
      image_url = excluded.image_url,
      match_type = excluded.match_type,
      year = excluded.year,
      set_name = excluded.set_name,
      card_number = excluded.card_number,
      player_name = excluded.player_name,
      variant = excluded.variant,
      is_serial = excluded.is_serial,
      serial_number = excluded.serial_number,
      serial_current = excluded.serial_current,
      serial_limit = excluded.serial_limit,
      is_auto = excluded.is_auto,
      is_rookie = excluded.is_rookie,
      category = excluded.category,
      match_confidence = excluded.match_confidence,
      match_status = excluded.match_status,
      match_reasons = excluded.match_reasons,
      unmatched_fields = excluded.unmatched_fields,
      matcher_version = excluded.matcher_version
  `);
  const info = stmt.run(
    listing.externalId,
    listing.source,
    listing.title,
    listing.price,
    listing.url,
    listing.imageUrl,
    listing.matchType,
    listing.year,
    listing.setName,
    listing.cardNumber,
    listing.playerName,
    listing.variant,
    listing.isSerial ? 1 : 0,
    listing.serialNumber,
    listing.serialCurrent,
    listing.serialLimit,
    listing.isAuto ? 1 : 0,
    listing.isRookie ? 1 : 0,
    listing.category,
    listing.matchConfidence,
    listing.matchStatus,
    JSON.stringify(listing.matchReasons),
    JSON.stringify(listing.unmatchedFields),
    listing.matcherVersion,
  );
  upsertProductCardMatch(db, listing);
  return info.changes > 0;
}

function upsertProductCardMatch(db: Database.Database, listing: ListingInsert): void {
  db.prepare(`
    INSERT INTO product_card_matches (
      source, external_id, matched_player_name, confidence, status,
      matched_fields, match_reasons, unmatched_fields, matcher_version
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, external_id, matcher_version) DO UPDATE SET
      matched_player_name = excluded.matched_player_name,
      confidence = excluded.confidence,
      status = excluded.status,
      matched_fields = excluded.matched_fields,
      match_reasons = excluded.match_reasons,
      unmatched_fields = excluded.unmatched_fields,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    listing.source,
    listing.externalId,
    listing.playerName,
    listing.matchConfidence,
    listing.matchStatus,
    JSON.stringify([
      listing.playerName ? 'player' : null,
      listing.setName ? 'set' : null,
      listing.cardNumber ? 'card_number' : null,
      listing.variant ? 'parallel' : null,
      listing.isSerial ? 'serial' : null,
    ].filter(Boolean)),
    JSON.stringify(listing.matchReasons),
    JSON.stringify(listing.unmatchedFields),
    listing.matcherVersion
  );
}

export function markOOS(db: Database.Database, externalId: string, source: string): void {
  const stmt = db.prepare(`
    UPDATE listings_feed SET is_oos = 1
    WHERE external_id = ? AND source = ?
  `);
  stmt.run(externalId, source);
}

export function dismissListing(db: Database.Database, id: number): void {
  const stmt = db.prepare(`
    UPDATE listings_feed SET is_dismissed = 1 WHERE id = ?
  `);
  stmt.run(id);
}

// ─── Listings Queries ──────────────────────────────────────────────

export function getActiveFeed(db: Database.Database): ListingRow[] {
  const stmt = db.prepare(`
    SELECT * FROM listings_feed
    WHERE is_dismissed = 0 AND is_oos = 0
    ORDER BY created_at DESC
  `);
  return stmt.all() as ListingRow[];
}

export function getAllActiveListings(db: Database.Database): ListingRow[] {
  const stmt = db.prepare(`
    SELECT * FROM listings_feed
    WHERE is_oos = 0
    ORDER BY created_at DESC
  `);
  return stmt.all() as ListingRow[];
}

// ─── Scan Run Tracking ─────────────────────────────────────────────

export function createScanRun(db: Database.Database, mode: ScanMode): number {
  const stmt = db.prepare(`
    INSERT INTO scan_runs (mode, status) VALUES (?, 'running')
  `);
  const info = stmt.run(mode);
  return Number(info.lastInsertRowid);
}

export function updateScanRun(
  db: Database.Database,
  id: number,
  update: { processed?: number; matched?: number; status?: string; error?: string }
): void {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (update.processed !== undefined) {
    sets.push('processed = ?');
    params.push(update.processed);
  }
  if (update.matched !== undefined) {
    sets.push('matched = ?');
    params.push(update.matched);
  }
  if (update.status !== undefined) {
    sets.push('status = ?');
    params.push(update.status);
    if (update.status === 'completed' || update.status === 'failed') {
      sets.push('completed_at = CURRENT_TIMESTAMP');
    }
  }
  if (update.error !== undefined) {
    sets.push('error = ?');
    params.push(update.error);
  }

  if (sets.length === 0) return;
  params.push(id);
  db.prepare(`UPDATE scan_runs SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

export function getLatestScanRun(db: Database.Database): ScanRunRow | undefined {
  const stmt = db.prepare(`
    SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1
  `);
  return stmt.get() as ScanRunRow | undefined;
}
