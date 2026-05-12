const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

loadDotEnv(path.join(__dirname, '..', '.env'));

const args = new Set(process.argv.slice(2));
const shouldApplySchema = args.has('--apply-schema');
const shouldTruncate = args.has('--truncate');
const shouldDryRun = args.has('--dry-run');

const rootDir = path.resolve(__dirname, '..');
const sqlitePath = process.env.SQLITE_DB_PATH || path.join(rootDir, 'cardalarm.db');
const pgUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
const rejectUnauthorized = process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== 'false' && process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false';
const connectionString = rejectUnauthorized ? pgUrl : removeSslMode(pgUrl);

if (!pgUrl && !shouldDryRun) {
  console.error('Missing SUPABASE_DB_URL, DATABASE_POSTGRES_URL_NON_POOLING, or DATABASE_URL.');
  process.exit(1);
}

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite database not found at ${sqlitePath}`);
  process.exit(1);
}

const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
const jsonColumns = new Set([
  'metadata',
  'raw_latest_payload',
  'raw_payload',
  'matched_fields',
  'match_reasons',
  'unmatched_fields',
]);
const booleanColumns = new Set([
  'available',
  'availability',
  'current_availability',
  'is_active',
  'is_dismissed',
  'is_oos',
  'is_serial',
  'is_auto',
  'is_rookie',
  'notification_enabled',
  'rookie_only',
  'autograph_only',
  'relic_only',
  'serial_numbered_only',
  'graded_only',
  'raw_only',
]);

const tableOrder = [
  'profiles',
  'stores',
  'store_scan_runs',
  'reference_checklists',
  'watchlist',
  'listings_feed',
  'source_products',
  'product_snapshots',
  'product_card_matches',
  'watchlist_matches',
  'scan_runs',
];

const truncationOrder = [
  'admin_audit_log',
  'alerts',
  'product_availability_events',
  'match_feedback',
  'watchlist_matches',
  'product_card_matches',
  'product_snapshots',
  'store_products',
  'source_products',
  'listings_feed',
  'watchlist_rules',
  'watchlists',
  'watchlist',
  'card_catalogue_variants',
  'card_catalogue_cards',
  'card_catalogue_sets',
  'player_aliases',
  'players',
  'teams',
  'reference_checklists',
  'store_scan_runs',
  'stores',
  'profiles',
  'scan_runs',
];

function removeSslMode(value) {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
}

function sqliteTables(db) {
  return new Set(
    db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
      .all()
      .map((row) => row.name),
  );
}

function columnsFor(db, table) {
  return db.prepare(`pragma table_info(${JSON.stringify(table)})`).all().map((row) => row.name);
}

function normalizeValue(column, value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (booleanColumns.has(column)) return Boolean(value);
  if (jsonColumns.has(column)) {
    if (value === '') return null;
    if (typeof value !== 'string') return JSON.stringify(value);
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return value;
    }
  }
  return value;
}

function conflictClause(table) {
  if (table === 'source_products') return 'on conflict (source, external_id) do update set ';
  if (table === 'listings_feed') return 'on conflict (source, external_id) do update set ';
  if (table === 'product_card_matches') return 'on conflict (source, external_id, matcher_version) do update set ';
  if (table === 'stores') return 'on conflict (slug) do update set ';
  if (table === 'profiles') return 'on conflict (user_id) do update set ';
  return 'on conflict do nothing';
}

function batchSizeFor(columns) {
  return Math.max(1, Math.min(500, Math.floor(30000 / Math.max(columns.length, 1))));
}

function buildValuesPlaceholders(columns, rowCount) {
  let parameterIndex = 1;
  return Array.from({ length: rowCount }, () => {
    const placeholders = columns.map(() => `$${parameterIndex++}`).join(', ');
    return `(${placeholders})`;
  }).join(', ');
}

function buildUpsertSql(table, columns, rowCount) {
  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  const placeholders = buildValuesPlaceholders(columns, rowCount);
  const conflict = conflictClause(table);
  if (conflict === 'on conflict do nothing') {
    return `insert into public.${table} (${quotedColumns}) values ${placeholders} on conflict do nothing`;
  }
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(', ');
  return `insert into public.${table} (${quotedColumns}) values ${placeholders} ${conflict}${updates}`;
}

async function dropPublicSchemaObjects(client) {
  await client.query(`
    do $$
    declare
      object_record record;
    begin
      for object_record in
        select quote_ident(table_schema) as schema_name, quote_ident(table_name) as object_name
        from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
      loop
        execute 'drop table if exists ' || object_record.schema_name || '.' || object_record.object_name || ' cascade';
      end loop;

      for object_record in
        select quote_ident(table_schema) as schema_name, quote_ident(table_name) as object_name
        from information_schema.views
        where table_schema = 'public'
      loop
        execute 'drop view if exists ' || object_record.schema_name || '.' || object_record.object_name || ' cascade';
      end loop;

      for object_record in
        select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
      loop
        execute format('drop function if exists %I.%I(%s) cascade', object_record.schema_name, object_record.function_name, object_record.arguments);
      end loop;
    end $$;
  `);
}

async function importTable(client, db, table) {
  const columns = columnsFor(db, table);
  const rows = db.prepare(`select * from ${JSON.stringify(table)}`).all();
  if (rows.length === 0) return { table, rows: 0 };

  const batchSize = batchSizeFor(columns);
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const sql = buildUpsertSql(table, columns, batch.length);
    const values = batch.flatMap((row) => columns.map((column) => normalizeValue(column, row[column])));
    await client.query(sql, values);
  }
  return { table, rows: rows.length };
}

async function importStoreProducts(client, db, tables) {
  if (!tables.has('source_products')) return { table: 'store_products', rows: 0 };
  const rows = db.prepare('select * from source_products').all();
  const columns = [
    'source',
    'external_product_id',
    'handle',
    'product_url',
    'canonical_url',
    'title',
    'normalized_title',
    'description',
    'current_price',
    'currency',
    'current_availability',
    'image_url',
    'product_fingerprint',
    'first_seen_at',
    'last_seen_at',
    'last_checked_at',
    'is_active',
    'raw_latest_payload',
  ];
  const batchSize = batchSizeFor(columns);
  const updateClause = `on conflict (source, external_product_id) do update set ${columns
    .filter((column) => column !== 'source' && column !== 'external_product_id')
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(', ')}`;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
    const valuesSql = buildValuesPlaceholders(columns, batch.length);
    const sql = `insert into public.store_products (${quotedColumns}) values ${valuesSql} ${updateClause}`;
    const values = batch.flatMap((row) => [
        row.source,
        row.external_id,
        row.handle,
        row.url,
        row.url,
        row.title,
        row.normalized_title,
        row.description,
        row.price,
        'NZD',
        Boolean(row.available),
        row.image_url,
        row.content_hash,
        row.first_seen_at,
        row.last_seen_at || row.last_checked_at,
        row.last_checked_at,
        true,
        normalizeValue('raw_latest_payload', row.raw_latest_payload),
      ]);
    await client.query(sql, values);
  }

  await client.query(`
    update public.product_snapshots ps
    set store_product_id = sp.id
    from public.store_products sp
    where ps.store_product_id is null
      and sp.source = ps.source
      and sp.external_product_id = ps.external_id
  `);

  await client.query(`
    update public.product_card_matches pcm
    set store_product_id = sp.id
    from public.store_products sp
    where pcm.store_product_id is null
      and sp.source = pcm.source
      and sp.external_product_id = pcm.external_id
  `);

  return { table: 'store_products', rows: rows.length };
}

async function resetSequences(client) {
  const tables = await client.query(`
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'id'
  `);
  for (const row of tables.rows) {
    const sequence = await client.query(
      "select pg_get_serial_sequence($1, 'id') as sequence_name",
      [`public.${row.table_name}`],
    );
    const sequenceName = sequence.rows[0]?.sequence_name;
    if (!sequenceName) continue;

    const maxId = await client.query(`select max(id)::bigint as max_id from public.${row.table_name}`);
    const value = maxId.rows[0]?.max_id;
    await client.query('select setval($1, $2, $3)', [sequenceName, value || 1, Boolean(value)]);
  }
}

async function main() {
  const db = new Database(sqlitePath, { readonly: true });
  const tables = sqliteTables(db);

  if (shouldDryRun) {
    for (const table of tableOrder) {
      if (!tables.has(table)) continue;
      const count = db.prepare(`select count(*) as count from ${JSON.stringify(table)}`).get().count;
      console.log(`${table}: ${count}`);
    }
    const sourceCount = tables.has('source_products')
      ? db.prepare('select count(*) as count from source_products').get().count
      : 0;
    console.log(`store_products: ${sourceCount} derived from source_products`);
    db.close();
    return;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized } });
  await client.connect();

  try {
    await client.query('begin');

    if (shouldApplySchema) {
      if (shouldTruncate) {
        await dropPublicSchemaObjects(client);
      }
      const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
      for (const migrationFile of migrationFiles) {
        const migrationSql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf8');
        await client.query(migrationSql);
      }
    }

    if (shouldTruncate && !shouldApplySchema) {
      await client.query(`truncate table ${truncationOrder.map((table) => `public.${table}`).join(', ')} restart identity cascade`);
    }

    for (const table of tableOrder) {
      if (!tables.has(table)) continue;
      const result = await importTable(client, db, table);
      console.log(`Imported ${result.rows} rows into ${result.table}`);
    }

    const derivedResult = await importStoreProducts(client, db, tables);
    console.log(`Imported ${derivedResult.rows} rows into ${derivedResult.table}`);

    await resetSequences(client);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
