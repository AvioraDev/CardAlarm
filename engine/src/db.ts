import fs from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient, type QueryResult, type QueryResultRow } from 'pg';
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

export type DbClient = Pool | PoolClient;

let pool: Pool | null = null;
let localEnvLoaded = false;

const localDbEnvKeys = new Set([
  'DATABASE_POSTGRES_URL_NON_POOLING',
  'DATABASE_URL',
  'POSTGRES_SSL_REJECT_UNAUTHORIZED',
  'PGSSLMODE',
  'POSTGRES_POOL_MAX',
]);

function loadLocalEnvFile(): void {
  if (localEnvLoaded || process.env.NODE_ENV === 'production') return;
  localEnvLoaded = true;

  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!localDbEnvKeys.has(key)) continue;

    process.env[key] = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}

function connectionString(): string {
  loadLocalEnvFile();
  const value = process.env.DATABASE_POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_POSTGRES_URL_NON_POOLING or DATABASE_URL is required for Postgres runtime access');
  }
  return value;
}

function normalizeConnectionString(value: string): string {
  loadLocalEnvFile();
  if (process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false') return value;
  const parsed = new URL(value);
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

function sslConfig(): { rejectUnauthorized: boolean } | undefined {
  loadLocalEnvFile();
  if (process.env.PGSSLMODE === 'disable') return undefined;
  return {
    rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

export function getDb(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: normalizeConnectionString(connectionString()),
    ssl: sslConfig(),
    max: Number(process.env.POSTGRES_POOL_MAX ?? 8),
  });
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function query<T extends QueryResultRow = QueryResultRow>(
  db: DbClient,
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return db.query<T>(sql, params);
}

function parseJson(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function matchedFieldsFor(listing: ListingInsert): string[] {
  return [
    listing.playerName ? 'player' : null,
    listing.setName ? 'set' : null,
    listing.cardNumber ? 'card_number' : null,
    listing.variant ? 'parallel' : null,
    listing.isSerial ? 'serial' : null,
  ].filter((field): field is string => Boolean(field));
}

export async function upsertSourceProducts(
  db: DbClient,
  products: SourceProductCacheInput[],
  matchContextHash: string
): Promise<SourceProductCacheStatus[]> {
  if (products.length === 0) return [];

  const source = products[0]!.source;
  const ids = products.map(product => product.externalId);
  const existing = await query<Pick<SourceProductRow, 'source' | 'external_id' | 'content_hash' | 'last_matched_hash' | 'last_matched_context_hash'>>(
    db,
    `select source, external_id, content_hash, last_matched_hash, last_matched_context_hash
     from source_products
     where source = $1 and external_id = any($2::text[])`,
    [source, ids]
  );
  const existingById = new Map(existing.rows.map(row => [row.external_id, row]));
  const statuses: SourceProductCacheStatus[] = [];

  await withTransaction(async client => {
    for (const product of products) {
      const existingRow = existingById.get(product.externalId);
      const isNew = !existingRow;
      const changed = existingRow?.content_hash !== product.contentHash;
      const alreadyMatched =
        existingRow?.last_matched_hash === product.contentHash &&
        existingRow?.last_matched_context_hash === matchContextHash;

      await client.query(
        `insert into source_products (
          source, external_id, handle, title, price, available, url, image_url,
          description, normalized_title, raw_latest_payload, content_hash,
          last_seen_scan_token, last_checked_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,now())
        on conflict (source, external_id) do update set
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
          last_seen_at = now(),
          last_checked_at = now(),
          last_seen_scan_token = excluded.last_seen_scan_token`,
        [
          product.source,
          product.externalId,
          product.handle,
          product.title,
          product.price,
          product.available,
          product.url,
          product.imageUrl,
          product.description,
          product.title.toLowerCase(),
          product.rawPayload,
          product.contentHash,
          product.scanToken,
        ]
      );

      await client.query(
        `insert into store_products (
          source, external_product_id, handle, title, current_price, current_availability,
          product_url, canonical_url, image_url, description, normalized_title,
          raw_latest_payload, product_fingerprint, last_checked_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11::jsonb,$12,now())
        on conflict (source, external_product_id) do update set
          handle = excluded.handle,
          title = excluded.title,
          current_price = excluded.current_price,
          current_availability = excluded.current_availability,
          product_url = excluded.product_url,
          canonical_url = excluded.canonical_url,
          image_url = excluded.image_url,
          description = excluded.description,
          normalized_title = excluded.normalized_title,
          raw_latest_payload = excluded.raw_latest_payload,
          product_fingerprint = excluded.product_fingerprint,
          last_seen_at = now(),
          last_checked_at = now(),
          updated_at = now()`,
        [
          product.source,
          product.externalId,
          product.handle,
          product.title,
          product.price,
          product.available,
          product.url,
          product.imageUrl,
          product.description,
          product.title.toLowerCase(),
          product.rawPayload,
          product.contentHash,
        ]
      );

      if (isNew || changed) {
        const storeProduct = await client.query<{ id: number }>(
          'select id from store_products where source = $1 and external_product_id = $2',
          [product.source, product.externalId]
        );
        await client.query(
          `insert into product_snapshots (
            store_product_id, source, external_id, title, description, price, availability,
            image_url, raw_payload, content_hash
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
          [
            storeProduct.rows[0]?.id ?? null,
            product.source,
            product.externalId,
            product.title,
            product.description,
            product.price,
            product.available,
            product.imageUrl,
            product.rawPayload,
            product.contentHash,
          ]
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

  return statuses;
}

export async function markSourceProductsMatched(
  db: DbClient,
  source: string,
  matches: { externalId: string; contentHash: string }[],
  matchContextHash: string
): Promise<void> {
  if (matches.length === 0) return;
  await withTransaction(async client => {
    for (const row of matches) {
      await client.query(
        `update source_products
         set last_matched_hash = $1, last_matched_context_hash = $2
         where source = $3 and external_id = $4`,
        [row.contentHash, matchContextHash, source, row.externalId]
      );
    }
  });
}

export async function markMissingSourceProductsOOS(
  db: DbClient,
  source: string,
  scanToken: string
): Promise<number> {
  return withTransaction(async client => {
    await client.query(
      `update source_products
       set available = false
       where source = $1 and available = true and last_seen_scan_token is distinct from $2`,
      [source, scanToken]
    );
    await client.query(
      `update store_products
       set current_availability = false, is_active = false, updated_at = now()
       where source = $1 and current_availability = true
         and external_product_id in (select external_id from source_products where source = $1 and available = false)`,
      [source]
    );
    const result = await client.query(
      `update listings_feed
       set is_oos = true
       where source = $1 and is_oos = false
         and external_id in (select external_id from source_products where source = $1 and available = false)`,
      [source]
    );
    return result.rowCount ?? 0;
  });
}

export async function reconcileSourceAvailability(
  db: DbClient,
  source: string,
  availableExternalIds: string[]
): Promise<number> {
  return withTransaction(async client => {
    await client.query(
      `update source_products
       set available = external_id = any($2::text[])
       where source = $1`,
      [source, availableExternalIds]
    );
    await client.query(
      `update store_products
       set current_availability = external_product_id = any($2::text[]),
           is_active = external_product_id = any($2::text[]),
           updated_at = now()
       where source = $1`,
      [source, availableExternalIds]
    );
    const updatedFeed = await client.query(
      `update listings_feed
       set is_oos = true
       where source = $1 and is_oos = false and not (external_id = any($2::text[]))`,
      [source, availableExternalIds]
    );
    return updatedFeed.rowCount ?? 0;
  });
}

export async function getChecklistBySetAndNumber(
  db: DbClient,
  setNameFragment: string,
  cardNumber: string
): Promise<ChecklistRow | undefined> {
  const result = await query<ChecklistRow>(
    db,
    `select * from reference_checklists
     where card_number = $1 and set_name ilike $2
     limit 1`,
    [cardNumber, `%${setNameFragment}%`]
  );
  return result.rows[0];
}

export async function getChecklistByNumber(db: DbClient, cardNumber: string): Promise<ChecklistRow[]> {
  const result = await query<ChecklistRow>(db, 'select * from reference_checklists where card_number = $1', [cardNumber]);
  return result.rows;
}

export async function getAllChecklistPlayerNames(db: DbClient): Promise<string[]> {
  const result = await query<{ player_name: string }>(db, 'select distinct player_name from reference_checklists where player_name is not null');
  return result.rows.map(row => row.player_name);
}

export async function getActiveWatchlistPlayers(db: DbClient): Promise<WatchlistRow[]> {
  const userWatchlistResult = await query<WatchlistRow>(
    db,
    `select
       wr.id,
       coalesce(nullif(split_part(wr.include_terms, ',', 1), ''), w.name) as player_name,
       concat_ws(', ', wr.parallel, wr.product_line, wr.brand) as variants,
       wr.card_number as target_numbers,
       w.is_active
     from watchlist_rules wr
     join watchlists w on w.id = wr.watchlist_id
     where w.is_active = true
       and (
         nullif(wr.include_terms, '') is not null
         or nullif(w.name, '') is not null
       )
     order by player_name`
  );

  if (userWatchlistResult.rows.length > 0) return userWatchlistResult.rows;

  const legacyResult = await query<WatchlistRow>(
    db,
    'select * from watchlist where is_active = true order by player_name'
  );
  return legacyResult.rows;
}

export async function isPlayerOnWatchlist(db: DbClient, playerName: string): Promise<boolean> {
  const result = await query(db, 'select 1 from watchlist where player_name ilike $1 and is_active = true limit 1', [playerName]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function upsertListing(db: DbClient, listing: ListingInsert): Promise<boolean> {
  const inserted = await withTransaction(async client => {
    const result = await client.query(
      `insert into listings_feed (
        external_id, source, title, price, url, image_url, match_type,
        year, set_name, card_number, player_name, variant,
        is_serial, serial_number, serial_current, serial_limit, is_auto, is_rookie, category,
        match_confidence, match_status, match_reasons, unmatched_fields, matcher_version
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,$23::jsonb,$24)
      on conflict (source, external_id) do update set
        is_oos = false,
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
        matcher_version = excluded.matcher_version`,
      [
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
        listing.isSerial,
        listing.serialNumber,
        listing.serialCurrent,
        listing.serialLimit,
        listing.isAuto,
        listing.isRookie,
        listing.category,
        listing.matchConfidence,
        listing.matchStatus,
        JSON.stringify(listing.matchReasons),
        JSON.stringify(listing.unmatchedFields),
        listing.matcherVersion,
      ]
    );

    await upsertProductCardMatch(client, listing);
    return (result.rowCount ?? 0) > 0;
  });
  return inserted;
}

async function upsertProductCardMatch(db: DbClient, listing: ListingInsert): Promise<void> {
  const storeProduct = await db.query<{ id: number }>(
    'select id from store_products where source = $1 and external_product_id = $2',
    [listing.source, listing.externalId]
  );
  await db.query(
    `insert into product_card_matches (
      store_product_id, source, external_id, matched_player_name, confidence, status,
      matched_fields, match_reasons, unmatched_fields, matcher_version
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
    on conflict (source, external_id, matcher_version) do update set
      store_product_id = excluded.store_product_id,
      matched_player_name = excluded.matched_player_name,
      confidence = excluded.confidence,
      status = excluded.status,
      matched_fields = excluded.matched_fields,
      match_reasons = excluded.match_reasons,
      unmatched_fields = excluded.unmatched_fields,
      updated_at = now()`,
    [
      storeProduct.rows[0]?.id ?? null,
      listing.source,
      listing.externalId,
      listing.playerName,
      listing.matchConfidence,
      listing.matchStatus,
      JSON.stringify(matchedFieldsFor(listing)),
      JSON.stringify(listing.matchReasons),
      JSON.stringify(listing.unmatchedFields),
      listing.matcherVersion,
    ]
  );
}

export async function markOOS(db: DbClient, externalId: string, source: string): Promise<void> {
  await query(db, 'update listings_feed set is_oos = true where external_id = $1 and source = $2', [externalId, source]);
}

export async function dismissListing(db: DbClient, id: number): Promise<void> {
  await query(db, 'update listings_feed set is_dismissed = true where id = $1', [id]);
}

export async function getActiveFeed(db: DbClient): Promise<ListingRow[]> {
  const result = await query<ListingRow>(
    db,
    `select * from listings_feed
     where is_dismissed = false and is_oos = false
     order by created_at desc`
  );
  return result.rows;
}

export async function getAllActiveListings(db: DbClient): Promise<ListingRow[]> {
  const result = await query<ListingRow>(db, 'select * from listings_feed where is_oos = false order by created_at desc');
  return result.rows;
}

export async function createScanRun(db: DbClient, mode: ScanMode): Promise<number> {
  const result = await query<{ id: number }>(db, 'insert into scan_runs (mode, status) values ($1, $2) returning id', [mode, 'running']);
  return Number(result.rows[0]!.id);
}

export async function updateScanRun(
  db: DbClient,
  id: number,
  update: { processed?: number; matched?: number; status?: string; error?: string }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (update.processed !== undefined) {
    params.push(update.processed);
    sets.push(`processed = $${params.length}`);
  }
  if (update.matched !== undefined) {
    params.push(update.matched);
    sets.push(`matched = $${params.length}`);
  }
  if (update.status !== undefined) {
    params.push(update.status);
    sets.push(`status = $${params.length}`);
    if (update.status === 'completed' || update.status === 'failed') {
      sets.push('completed_at = now()');
    }
  }
  if (update.error !== undefined) {
    params.push(update.error);
    sets.push(`error = $${params.length}`);
  }
  if (sets.length === 0) return;
  params.push(id);
  await query(db, `update scan_runs set ${sets.join(', ')} where id = $${params.length}`, params);
}

export async function getLatestScanRun(db: DbClient): Promise<ScanRunRow | undefined> {
  const result = await query<ScanRunRow>(db, 'select * from scan_runs order by started_at desc limit 1');
  return result.rows[0];
}
