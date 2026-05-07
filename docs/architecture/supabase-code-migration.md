# Supabase Code Migration Implementation

## Completed

- Runtime database access now targets Supabase Postgres through server-only `pg` pools.
- Engine scanner/matcher database calls are async and write compatibility tables plus MVP cache/match tables.
- Web dashboard, admin watchlist actions, and scan-status API now read/write Postgres instead of SQLite.
- Web runtime dependency on `better-sqlite3` was removed.
- SQLite support remains only for tests and import tooling.
- Supabase-generated type coverage was added at `web/src/lib/database.types.ts` for current runtime tables.

## Compatibility Mode

Auth is not implemented yet, so the UI still uses global compatibility tables:

- `watchlist`
- `listings_feed`
- `scan_runs`

The Supabase schema already includes user-owned `watchlists`, `watchlist_rules`, and `watchlist_matches` for the next Auth phase.

## Data Import Status

Full reset/import to Supabase project `quqcakgjoypgfuwylpbq` now succeeds with the configured local Postgres connection string.
The importer batches multi-row Postgres inserts to avoid the previous row-by-row timeout, and JSON fields are serialized explicitly for `jsonb` columns.

Local SQLite dry-run and hosted Supabase verification both report these imported counts:

- `reference_checklists`: 33,866
- `source_products`: 16,751
- `store_products`: 16,751 derived rows
- `listings_feed`: 169
- `product_snapshots`: 500
- `product_card_matches`: 4
- `watchlist`: 4
- `scan_runs`: 2

The destructive reset/import command is:

```powershell
npm run db:migrate:supabase:reset
```

## Validation

- `npm run db:migrate:supabase:dry-run` passed.
- `npx tsc --noEmit` passed.
- `npm test -- --runInBand` passed.
- `cd web; npm run lint` passed.
- `cd web; npm run build` passed.
- Supabase MCP security advisors returned no findings.
- Supabase MCP count verification passed for core imported tables.

## Next Steps

1. Start the web app with `DATABASE_URL` loaded from `web/.env.local`.
2. Run one scan and verify new rows appear in `scan_runs`, `source_products`, `store_products`, `product_snapshots`, `listings_feed`, and `product_card_matches`.
3. Proceed to Auth and migrate from global `watchlist` to user-owned `watchlists` and `watchlist_rules`.
