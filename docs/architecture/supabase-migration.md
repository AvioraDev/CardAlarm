# Supabase Migration Plan

## Current Status

CardAlarm is now prepared for a Supabase Postgres migration while the application continues to run against the local SQLite database during the transition.

The repository now contains:

- `supabase/config.toml` for Supabase CLI project configuration.
- `supabase/migrations/20260507000000_initial_schema.sql` for the hosted Postgres schema.
- `scripts/migrate-sqlite-to-supabase.js` for importing the current `cardalarm.db` data into Supabase.
- `npm run db:migrate:supabase` to apply schema and import data without clearing target rows.
- `npm run db:migrate:supabase:reset` to apply schema, truncate CardAlarm app tables, and re-import from SQLite.

## Why Supabase Now

The MVP roadmap expects managed Postgres before authentication. Moving the database first gives us:

- A scalable schema for cached inventory, snapshots, catalogue records, matches, watchlists, feedback, and admin audit data.
- A clean path into Supabase Auth and row-level security.
- A hosted data layer for future background scanning and dashboard queries.
- A repeatable migration script instead of one-off manual exports.

## Schema Strategy

The migration keeps two layers intentionally:

1. **Compatibility tables** used by the current proof of concept:
   - `source_products`
   - `listings_feed`
   - `reference_checklists`
   - `watchlist`
   - `scan_runs`

2. **MVP target tables** from the master context:
   - `profiles`
   - `stores`
   - `store_scan_runs`
   - `store_products`
   - `product_snapshots`
   - `players`
   - `player_aliases`
   - `teams`
   - `card_catalogue_sets`
   - `card_catalogue_cards`
   - `card_catalogue_variants`
   - `watchlists`
   - `watchlist_rules`
   - `product_card_matches`
   - `watchlist_matches`
   - `match_feedback`
   - `admin_audit_log`

This avoids breaking the current app while creating the correct target shape for Auth, structured watchlists, review workflows, and dashboard isolation.

## Data Import Behaviour

The migration script reads SQLite from `SQLITE_DB_PATH` or `./cardalarm.db`.

It imports existing rows into matching compatibility tables, then derives `store_products` from `source_products` so the new MVP schema immediately has cached inventory available.

Current dry-run counts from the local database:

- `reference_checklists`: 33,866
- `watchlist`: 4
- `listings_feed`: 169
- `source_products`: 16,751
- `product_snapshots`: 500
- `product_card_matches`: 4
- `scan_runs`: 2
- `store_products`: 16,751 derived rows

## Environment Variables

Use `.env.example` as the template.

Required for hosted migration:

```powershell
$env:SUPABASE_DB_URL = "postgresql://..."
```

Optional local SQLite override:

```powershell
$env:SQLITE_DB_PATH = "C:\Dev\123456\cardalarm.db"
```

If the local operating system does not trust the Supabase pooler certificate chain, this migration-only override can be used:

```powershell
$env:SUPABASE_DB_SSL_REJECT_UNAUTHORIZED = "false"
```

Do not use that override in client-side or normal app runtime code.

## Commands

Dry-run local row counts:

```powershell
node scripts/migrate-sqlite-to-supabase.js --dry-run
```

Apply schema and import without clearing target data:

```powershell
npm run db:migrate:supabase
```

Reset CardAlarm app tables and re-import from SQLite:

```powershell
npm run db:migrate:supabase:reset
```

## Attempted Hosted Migration

The local environment had a `DATABASE_URL` configured, so the reset import was attempted.

The hosted connection failed before schema creation/import with:

```text
Tenant or user not found
```

Before retrying, verify in Supabase:

1. The project is active and not paused.
2. The connection string uses the correct project ref.
3. The username matches the selected connection mode.
4. The password is current.
5. The pooler host and region match the project settings.

Once the connection string is corrected, rerun:

```powershell
$env:SUPABASE_DB_SSL_REJECT_UNAUTHORIZED = "false"
npm run db:migrate:supabase:reset
```

## Security Notes

- The migration script uses the admin Postgres connection string and must only run locally or from a trusted admin environment.
- Do not expose `SUPABASE_DB_URL`, `DATABASE_URL`, service-role keys, or database passwords to the browser.
- The initial schema enables row-level security on user-owned tables: `profiles`, `watchlists`, `watchlist_rules`, `watchlist_matches`, and `match_feedback`.
- Auth-specific policies are included now so the next Auth phase has the correct ownership boundary.

## Follow-Up Work

After the hosted database connection is fixed and the import succeeds:

1. Move app read/write paths from SQLite to Supabase Postgres behind a small data-access layer.
2. Replace legacy `watchlist` usage with user-owned `watchlists` and `watchlist_rules`.
3. Backfill catalogue tables from `reference_checklists` into normalized `players`, `card_catalogue_sets`, and `card_catalogue_cards`.
4. Add Auth and verify row-level security with separate test users.
5. Move scanner writes to `store_products`, `product_snapshots`, and `product_card_matches` as the primary tables.

## MCP Rebuild Outcome - 2026-05-07

The Supabase MCP connector was used to rebuild the hosted CardAlarm project at `https://quqcakgjoypgfuwylpbq.supabase.co`.

Actions completed:

- Dropped all existing `public` schema tables, views, and functions in the connected project.
- Rebuilt the CardAlarm MVP schema with 22 `public` tables.
- Enabled RLS on every `public` table.
- Added owner-scoped policies for `profiles`, `watchlists`, `watchlist_rules`, `watchlist_matches`, and `match_feedback`.
- Added authenticated read policies for non-private catalogue/discovery tables needed by the app dashboard.
- Added admin-read policies for operational tables using `profiles.role = 'admin'`.
- Hardened `public.set_updated_at()` with an explicit `search_path`.
- Added indexes for foreign keys and core MVP query paths.

Verification:

- Project URL confirmed through MCP: `https://quqcakgjoypgfuwylpbq.supabase.co`.
- `public` table count after rebuild: 22.
- Supabase security advisors: no findings after hardening.
- Supabase performance advisors: only unused-index notices, expected because the rebuilt database is empty and query statistics have not accumulated yet.

Important note:

The hosted database schema has been rebuilt, but data has not yet been imported from `cardalarm.db`. The current app still reads local SQLite until the data access layer is moved to Supabase.
