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
  StoreScanRunUpdate,
  SourceProductCacheInput,
  SourceProductCacheStatus,
  SourceProductRow,
} from './types';
import {
  buildProductClassificationRows,
  type ProductClassificationByIdRow,
} from './product-classification';

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

type ExistingSourceProductCacheRow = Pick<
  SourceProductRow,
  'source' | 'external_id' | 'content_hash' | 'last_matched_hash' | 'last_matched_context_hash'
>;

type SourceProductBatchRow = {
  input_order: number;
  store_id: number | null;
  source: string;
  external_id: string;
  handle: string;
  title: string;
  price: number;
  available: boolean;
  url: string;
  image_url: string;
  description: string | null;
  normalized_title: string;
  raw_payload: string;
  content_hash: string;
  scan_token: string;
};

export type MatchedSourceProductBatchRow = {
  external_id: string;
  content_hash: string;
};

function sourceProductKey(source: string, externalId: string): string {
  return `${source}\u0000${externalId}`;
}

export function buildSourceProductBatchRows(products: SourceProductCacheInput[]): SourceProductBatchRow[] {
  const uniqueRows = new Map<string, SourceProductBatchRow>();

  products.forEach((product, inputOrder) => {
    uniqueRows.set(sourceProductKey(product.source, product.externalId), {
      input_order: inputOrder,
      store_id: product.storeId,
      source: product.source,
      external_id: product.externalId,
      handle: product.handle,
      title: product.title,
      price: product.price,
      available: product.available,
      url: product.url,
      image_url: product.imageUrl,
      description: product.description,
      normalized_title: product.title.toLowerCase(),
      raw_payload: product.rawPayload,
      content_hash: product.contentHash,
      scan_token: product.scanToken,
    });
  });

  return Array.from(uniqueRows.values()).sort((a, b) => a.input_order - b.input_order);
}

export function buildMatchedSourceProductBatchRows(
  matches: { externalId: string; contentHash: string }[]
): MatchedSourceProductBatchRow[] {
  const uniqueRows = new Map<string, MatchedSourceProductBatchRow & { input_order: number }>();

  matches.forEach((match, inputOrder) => {
    uniqueRows.set(match.externalId, {
      input_order: inputOrder,
      external_id: match.externalId,
      content_hash: match.contentHash,
    });
  });

  return Array.from(uniqueRows.values())
    .sort((a, b) => a.input_order - b.input_order)
    .map(({ input_order: _inputOrder, ...row }) => row);
}

export async function upsertSourceProducts(
  db: DbClient,
  products: SourceProductCacheInput[],
  matchContextHash: string
): Promise<SourceProductCacheStatus[]> {
  if (products.length === 0) return [];

  const batchRows = buildSourceProductBatchRows(products);
  const payload = JSON.stringify(batchRows);
  const classificationPayload = JSON.stringify(buildProductClassificationRows(products));
  const existing = await query<ExistingSourceProductCacheRow>(
    db,
    `with input as (
       select source, external_id
       from jsonb_to_recordset($1::jsonb) as x(source text, external_id text)
     )
     select sp.source, sp.external_id, sp.content_hash, sp.last_matched_hash, sp.last_matched_context_hash
     from source_products sp
     join input i on i.source = sp.source and i.external_id = sp.external_id`,
    [payload]
  );
  const existingByKey = new Map(existing.rows.map(row => [sourceProductKey(row.source, row.external_id), row]));

  await withTransaction(async client => {
    await client.query(
      `with input as (
         select *
         from jsonb_to_recordset($1::jsonb) as x(
           input_order integer,
           store_id integer,
           source text,
           external_id text,
           handle text,
           title text,
           price numeric,
           available boolean,
           url text,
           image_url text,
           description text,
           normalized_title text,
           raw_payload text,
           content_hash text,
           scan_token text
         )
       ),
       existing_source as (
         select i.source, i.external_id, sp.content_hash as old_content_hash
         from input i
         left join source_products sp on sp.source = i.source and sp.external_id = i.external_id
       ),
       existing_store as (
         select
           i.source,
           i.external_id,
           sp.id as store_product_id,
           sp.store_id,
           sp.current_availability as old_availability,
           sp.current_price as old_price,
           sp.product_fingerprint as old_product_fingerprint
         from input i
         left join store_products sp on sp.source = i.source and sp.external_product_id = i.external_id
       ),
       upserted_source as (
         insert into source_products (
           source, external_id, handle, title, price, available, url, image_url,
           description, normalized_title, raw_latest_payload, content_hash,
           last_seen_scan_token, last_checked_at
         )
         select
           source, external_id, handle, title, price, available, url, image_url,
           description, normalized_title, raw_payload::jsonb, content_hash,
           scan_token, now()
         from input
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
           last_seen_scan_token = excluded.last_seen_scan_token
         returning source, external_id
       ),
       upserted_store as (
         insert into store_products (
           store_id, source, external_product_id, handle, title, current_price, current_availability,
           product_url, canonical_url, image_url, description, normalized_title,
           raw_latest_payload, product_fingerprint, last_checked_at
         )
         select
           store_id, source, external_id, handle, title, price, available,
           url, url, image_url, description, normalized_title,
           raw_payload::jsonb, content_hash, now()
         from input
         on conflict (source, external_product_id) do update set
           store_id = coalesce(excluded.store_id, store_products.store_id),
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
           updated_at = now()
         returning id, store_id, source, external_product_id, current_price, current_availability, product_fingerprint
       ),
       classification_input as (
         select *
         from jsonb_to_recordset($2::jsonb) as x(
           source text,
           external_id text,
           classifier_version text,
           classifier_type text,
           status text,
           year text,
           category text,
           brand text,
           product_line text,
           set_name text,
           card_number text,
           player_name text,
           team_name text,
           variant_name text,
           parallel_name text,
           insert_name text,
           is_rookie boolean,
           is_auto boolean,
           is_serial boolean,
           serial_number text,
           serial_current text,
           serial_limit text,
           confidence numeric,
           raw_signals jsonb
         )
       ),
       upserted_classifications as (
         insert into product_classifications (
           store_product_id, classifier_version, classifier_type, status,
           year, category, brand, product_line, set_name, card_number,
           player_name, team_name, variant_name, parallel_name, insert_name,
           is_rookie, is_auto, is_serial, serial_number, serial_current,
           serial_limit, confidence, raw_signals, updated_at
         )
         select
           us.id, ci.classifier_version, ci.classifier_type, ci.status,
           ci.year, ci.category, ci.brand, ci.product_line, ci.set_name, ci.card_number,
           ci.player_name, ci.team_name, ci.variant_name, ci.parallel_name, ci.insert_name,
           ci.is_rookie, ci.is_auto, ci.is_serial, ci.serial_number, ci.serial_current,
           ci.serial_limit, ci.confidence, ci.raw_signals, now()
         from classification_input ci
         join upserted_store us on us.source = ci.source and us.external_product_id = ci.external_id
         on conflict (store_product_id, classifier_version, classifier_type) do update set
           status = excluded.status,
           year = excluded.year,
           category = excluded.category,
           brand = excluded.brand,
           product_line = excluded.product_line,
           set_name = excluded.set_name,
           card_number = excluded.card_number,
           player_name = excluded.player_name,
           team_name = excluded.team_name,
           variant_name = excluded.variant_name,
           parallel_name = excluded.parallel_name,
           insert_name = excluded.insert_name,
           is_rookie = excluded.is_rookie,
           is_auto = excluded.is_auto,
           is_serial = excluded.is_serial,
           serial_number = excluded.serial_number,
           serial_current = excluded.serial_current,
           serial_limit = excluded.serial_limit,
           confidence = excluded.confidence,
           raw_signals = excluded.raw_signals,
           updated_at = now()
         returning id
       ),
       event_candidates as (
         select
           us.id as store_product_id,
           coalesce(us.store_id, es.store_id, i.store_id) as store_id,
           i.source,
           i.external_id,
           case
             when es.store_product_id is null then 'first_seen'
             when es.old_availability = false and i.available = true then 'restocked'
             when es.old_availability = true and i.available = false then 'sold_out'
             when es.old_price is distinct from i.price then 'price_changed'
             when es.old_product_fingerprint is distinct from i.content_hash then 'product_updated'
             else null
           end as event_type,
           i.scan_token,
           es.old_availability as previous_availability,
           i.available as current_availability,
           es.old_price as previous_price,
           i.price as current_price,
           es.old_product_fingerprint as previous_product_fingerprint,
           i.content_hash as current_product_fingerprint,
           jsonb_build_object(
             'handle', i.handle,
             'title', i.title,
             'source', i.source,
             'externalId', i.external_id
           ) as metadata
         from input i
         join upserted_store us on us.source = i.source and us.external_product_id = i.external_id
         left join existing_store es on es.source = i.source and es.external_id = i.external_id
         where es.store_product_id is null
           or es.old_availability is distinct from i.available
           or es.old_price is distinct from i.price
           or es.old_product_fingerprint is distinct from i.content_hash
       ),
       inserted_events as (
         insert into product_availability_events (
           store_product_id,
           store_id,
           source,
           external_id,
           event_type,
           detection_source,
           scan_token,
           previous_availability,
           current_availability,
           previous_price,
           current_price,
           previous_product_fingerprint,
           current_product_fingerprint,
           dedupe_key,
           metadata
         )
         select
           store_product_id,
           store_id,
           source,
           external_id,
           event_type,
           'scanner',
           scan_token,
           previous_availability,
           current_availability,
           previous_price,
           current_price,
           previous_product_fingerprint,
           current_product_fingerprint,
           event_type || ':' || store_product_id || ':' || scan_token,
           metadata
         from event_candidates
         where event_type is not null
         on conflict (dedupe_key) do nothing
         returning id
       )
       insert into product_snapshots (
         store_product_id, source, external_id, title, description, price, availability,
         image_url, raw_payload, content_hash
       )
       select
         us.id, i.source, i.external_id, i.title, i.description, i.price, i.available,
         i.image_url, i.raw_payload::jsonb, i.content_hash
       from input i
       join upserted_store us on us.source = i.source and us.external_product_id = i.external_id
       left join existing_source es on es.source = i.source and es.external_id = i.external_id
       where es.old_content_hash is null or es.old_content_hash is distinct from i.content_hash`,
      [payload, classificationPayload]
    );
  });

  return products.map(product => {
    const existingRow = existingByKey.get(sourceProductKey(product.source, product.externalId));
    const isNew = !existingRow;
    const changed = existingRow?.content_hash !== product.contentHash;
    const alreadyMatched =
      existingRow?.last_matched_hash === product.contentHash &&
      existingRow?.last_matched_context_hash === matchContextHash;

    return {
      externalId: product.externalId,
      contentHash: product.contentHash,
      isNew,
      changed,
      shouldMatch: product.available && (isNew || changed || !alreadyMatched),
    };
  });
}

export async function upsertProductClassificationsById(
  db: DbClient,
  rows: ProductClassificationByIdRow[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const result = await query(
    db,
    `with input as (
       select *
       from jsonb_to_recordset($1::jsonb) as x(
         store_product_id integer,
         source text,
         external_id text,
         classifier_version text,
         classifier_type text,
         status text,
         year text,
         category text,
         brand text,
         product_line text,
         set_name text,
         card_number text,
         player_name text,
         team_name text,
         variant_name text,
         parallel_name text,
         insert_name text,
         is_rookie boolean,
         is_auto boolean,
         is_serial boolean,
         serial_number text,
         serial_current text,
         serial_limit text,
         confidence numeric,
         raw_signals jsonb
       )
     )
     insert into product_classifications (
       store_product_id, classifier_version, classifier_type, status,
       year, category, brand, product_line, set_name, card_number,
       player_name, team_name, variant_name, parallel_name, insert_name,
       is_rookie, is_auto, is_serial, serial_number, serial_current,
       serial_limit, confidence, raw_signals, updated_at
     )
     select
       store_product_id, classifier_version, classifier_type, status,
       year, category, brand, product_line, set_name, card_number,
       player_name, team_name, variant_name, parallel_name, insert_name,
       is_rookie, is_auto, is_serial, serial_number, serial_current,
       serial_limit, confidence, raw_signals, now()
     from input
     on conflict (store_product_id, classifier_version, classifier_type) do update set
       status = excluded.status,
       year = excluded.year,
       category = excluded.category,
       brand = excluded.brand,
       product_line = excluded.product_line,
       set_name = excluded.set_name,
       card_number = excluded.card_number,
       player_name = excluded.player_name,
       team_name = excluded.team_name,
       variant_name = excluded.variant_name,
       parallel_name = excluded.parallel_name,
       insert_name = excluded.insert_name,
       is_rookie = excluded.is_rookie,
       is_auto = excluded.is_auto,
       is_serial = excluded.is_serial,
       serial_number = excluded.serial_number,
       serial_current = excluded.serial_current,
       serial_limit = excluded.serial_limit,
       confidence = excluded.confidence,
       raw_signals = excluded.raw_signals,
       updated_at = now()`,
    [JSON.stringify(rows)]
  );

  return result.rowCount ?? 0;
}

export async function markSourceProductsMatched(
  db: DbClient,
  source: string,
  matches: { externalId: string; contentHash: string }[],
  matchContextHash: string
): Promise<void> {
  if (matches.length === 0) return;

  const batchRows = buildMatchedSourceProductBatchRows(matches);
  if (batchRows.length === 0) return;

  await query(
    db,
    `with input as (
       select external_id, content_hash
       from jsonb_to_recordset($1::jsonb) as x(external_id text, content_hash text)
     )
     update source_products sp
     set last_matched_hash = input.content_hash,
         last_matched_context_hash = $2
     from input
     where sp.source = $3
       and sp.external_id = input.external_id`,
    [JSON.stringify(batchRows), matchContextHash, source]
  );
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
      `with candidates as (
         select
           sp.id,
           sp.store_id,
           sp.source,
           sp.external_product_id,
           sp.current_availability,
           sp.current_price,
           sp.product_fingerprint
         from store_products sp
         where sp.source = $1
           and sp.current_availability = true
           and sp.external_product_id in (
             select external_id
             from source_products
             where source = $1 and available = false
           )
       ),
       updated as (
         update store_products sp
         set current_availability = false, is_active = false, updated_at = now()
         from candidates c
         where sp.id = c.id
         returning sp.id
       )
       insert into product_availability_events (
         store_product_id,
         store_id,
         source,
         external_id,
         event_type,
         detection_source,
         scan_token,
         previous_availability,
         current_availability,
         previous_price,
         current_price,
         previous_product_fingerprint,
         current_product_fingerprint,
         dedupe_key,
         metadata
       )
       select
         c.id,
         c.store_id,
         c.source,
         c.external_product_id,
         'sold_out',
         'scanner',
         $2,
         c.current_availability,
         false,
         c.current_price,
         c.current_price,
         c.product_fingerprint,
         c.product_fingerprint,
         'sold_out:' || c.id || ':' || $2,
         jsonb_build_object('source', c.source, 'externalId', c.external_product_id, 'reason', 'missing_from_scan')
       from candidates c
       join updated u on u.id = c.id
       on conflict (dedupe_key) do nothing`,
      [source, scanToken]
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
  const result = await query<{ id: number }>(
    db,
    `with lock as (
       select pg_advisory_xact_lock(hashtext('cardalarm:scan_runs'))
     ),
     stale as (
       update scan_runs
       set status = 'failed',
           error = coalesce(error, 'Timed out: stale running scan cleared before new scan'),
           completed_at = now()
       where status = 'running'
         and started_at < now() - interval '30 minutes'
       returning id
     ),
     running as (
       select id
       from scan_runs
       where status = 'running'
       limit 1
     ),
     inserted as (
       insert into scan_runs (mode, status)
       select $1, 'running'
       from lock
       where not exists (select 1 from running)
       returning id
     )
     select id from inserted`,
    [mode]
  );

  const row = result.rows[0];
  if (!row) throw new Error('A scan is already running.');
  return Number(row.id);
}

export async function createStoreScanRun(
  db: DbClient,
  source: { storeId?: number | null; slug: string }
): Promise<number> {
  const result = await query<{ id: number }>(
    db,
    `with lock as (
       select pg_advisory_xact_lock(hashtext('cardalarm:store_scan_runs:' || $2))
     ),
     stale as (
       update store_scan_runs
       set status = 'failed',
           error_message = coalesce(error_message, 'Timed out: stale running store scan cleared before new scan'),
           completed_at = now(),
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('phase', 'failed', 'rejectedReason', 'stale_running_store_scan')
       where status = 'running'
         and started_at < now() - interval '30 minutes'
         and (
           ($1::bigint is not null and store_id = $1::bigint)
           or store_slug = $2
         )
       returning id
     ),
     running as (
       select id
       from store_scan_runs
       where status = 'running'
         and (
           ($1::bigint is not null and store_id = $1::bigint)
           or store_slug = $2
         )
       limit 1
     ),
     inserted as (
       insert into store_scan_runs (store_id, store_slug, status)
       select $1, $2, 'running'
       from lock
       where not exists (select 1 from running)
       returning id
     )
     select id from inserted`,
    [source.storeId ?? null, source.slug]
  );

  const row = result.rows[0];
  if (!row) throw new Error(`A scan is already running for store ${source.slug}.`);
  return Number(row.id);
}

export async function updateStoreScanRun(
  db: DbClient,
  id: number,
  update: StoreScanRunUpdate
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (update.status !== undefined) {
    params.push(update.status);
    sets.push(`status = $${params.length}`);
    if (update.status === 'completed' || update.status === 'failed' || update.status === 'cancelled') {
      sets.push('completed_at = now()');
    }
  }
  if (update.productsSeen !== undefined) {
    params.push(update.productsSeen);
    sets.push(`products_seen = $${params.length}`);
  }
  if (update.productsProcessed !== undefined) {
    params.push(update.productsProcessed);
    sets.push(`products_processed = $${params.length}`);
  }
  if (update.productsMatched !== undefined) {
    params.push(update.productsMatched);
    sets.push(`products_matched = $${params.length}`);
  }
  if (update.productsMarkedUnavailable !== undefined) {
    params.push(update.productsMarkedUnavailable);
    sets.push(`products_marked_unavailable = $${params.length}`);
  }
  if (update.errorMessage !== undefined) {
    params.push(update.errorMessage);
    sets.push(`error_message = $${params.length}`);
  }
  if (update.metadata !== undefined) {
    params.push(JSON.stringify(update.metadata));
    sets.push(`metadata = $${params.length}::jsonb`);
  }

  if (sets.length === 0) return;
  params.push(id);
  await query(db, `update store_scan_runs set ${sets.join(', ')} where id = $${params.length}`, params);
}

export async function markStoreScanSucceeded(db: DbClient, storeId: number | null | undefined): Promise<void> {
  if (!storeId) return;
  await query(db, 'update stores set last_successful_scan_at = now(), updated_at = now() where id = $1', [storeId]);
}

export async function markStoreScanFailed(db: DbClient, storeId: number | null | undefined): Promise<void> {
  if (!storeId) return;
  await query(db, 'update stores set last_failed_scan_at = now(), updated_at = now() where id = $1', [storeId]);
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
