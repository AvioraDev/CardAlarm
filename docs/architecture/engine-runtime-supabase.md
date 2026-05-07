# Engine Runtime Supabase

## Status

The engine now loads root `.env` database settings in local development before creating the Postgres pool.
This keeps scanner/runtime behavior aligned with the web app and migration script.

## Fix

The engine failed with:

```text
self-signed certificate in certificate chain
```

Root cause:

- `engine/src/db.ts` read only the inherited process environment.
- The local `.env` file already contained `POSTGRES_SSL_REJECT_UNAUTHORIZED=false`.
- The running engine did not load that file, so Node rejected the Supabase certificate chain.

## Runtime Rules

For local development, root `.env` controls:

- `DATABASE_POSTGRES_URL_NON_POOLING`
- `DATABASE_URL`
- `POSTGRES_SSL_REJECT_UNAUTHORIZED`
- `PGSSLMODE`
- `POSTGRES_POOL_MAX`

The engine prefers `DATABASE_POSTGRES_URL_NON_POOLING`, then `DATABASE_URL`.

The engine now reads active user-owned watchlists from:

- `watchlists`
- `watchlist_rules`

If no user-owned watchlists exist, it falls back to the legacy global `watchlist` table for compatibility only.

For local scan testing, scanner pacing can be tuned with:

- `CARDALARM_PAGE_SIZE`
- `CARDALARM_PAGE_CONCURRENCY`
- `CARDALARM_EARLY_STOP_UNCHANGED_PAGES`
- `CARDALARM_FETCH_TIMEOUT_MS`
- `CARDALARM_SCAN_DELAY_MIN_MS`
- `CARDALARM_SCAN_DELAY_MAX_MS`

Keep conservative defaults for normal daily scans. Use lower delays only when testing locally.

## Scanner Hang Analysis

The Shopify fetch path did not previously have a timeout, and each fetched page was processed as a large batch of sequential Supabase writes.
For a 250-product page this can look like a hang after the first `Fetching page 1` log.

The engine now:

- times out page fetches with `CARDALARM_FETCH_TIMEOUT_MS`
- logs fetch completion with product count and timing
- logs cache/upsert timing per page
- logs matching timing per page
- supports smaller page sizes through `CARDALARM_PAGE_SIZE`

For local debugging, use a smaller page size and short delays:

```env
CARDALARM_PAGE_SIZE=50
CARDALARM_SCAN_DELAY_MIN_MS=0
CARDALARM_SCAN_DELAY_MAX_MS=250
CARDALARM_FETCH_TIMEOUT_MS=15000
```

## Run Command

```powershell
npm run engine:start
```

If a stale engine process is running, stop it first.

## Validation

```powershell
npx tsc --noEmit
npm test -- --runInBand
```
