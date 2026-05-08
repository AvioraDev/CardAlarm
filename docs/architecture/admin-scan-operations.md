# Admin Scan Operations

## Status

Admin users can now trigger store scans, track scan progress, and view scan history from the UI.

## Implemented

- Added `/admin/scans`.
- Added recent scan run query support.
- Scan trigger/polling panel now lives only on the dedicated admin scans page.
- Scan runtime now loads active Shopify stores from `public.stores` before falling back to `sources.json`.
- Added scan run history table with mode, status, processed count, matched count, timestamps, and errors.
- Added per-store scan run history backed by `store_scan_runs`, including status, fetched, processed, matched, marked unavailable, timestamps, and error details.
- Linked scan operations from the admin page and header navigation.
- Updated engine scan execution to write source-level progress to `scan_runs`.
- Promoted the only current local profile to `admin` so the scan UI is reachable.

## Runtime Behavior

The scan UI supports:

- `Scan Watchlist`
- `Scan All`
- admin-only live polling through `/api/scan-status`
- optimistic running state
- recent scan status/history

Global progress is updated after each source completes.
Each scanned source also writes a `store_scan_runs` row and updates `stores.last_successful_scan_at` or `stores.last_failed_scan_at` when a database-backed store is involved.
This is enough for MVP visibility without adding a separate job runner yet.

The main dashboard does not render scan controls and does not poll scan status. `GET /api/scan-status` marks running scans older than 30 minutes as failed before returning status.

## Store Configuration

`public.stores` is the runtime source of truth for scanning. Active Shopify rows are loaded with:

- `slug`
- `name`
- `base_url`
- `source_type`
- `country_code`
- `currency`

`sources.json` remains only as a local development fallback when no active Shopify stores exist in the database and `CARDALARM_ALLOW_SOURCES_JSON_FALLBACK=true`.

To add a store manually, insert a row into `public.stores` with `source_type = 'shopify'` and `is_active = true`. To disable scanning for a store, set `is_active = false`.

## Manual Test Plan

1. Sign in.
2. Open `/admin/scans`.
3. Click `Scan All`.
4. Confirm status changes to running.
5. Confirm processed/matched counts update as sources complete.
6. Confirm the scan run appears in Recent Runs.
7. Confirm each store appears in Store scan history.
8. Confirm failures show in the Error column if a source fails.
9. Open `/dashboard?mode=all` after completion and confirm cached listings are visible.
10. Open `/dashboard` and confirm no repeated `/api/scan-status` requests occur.

## Commands

```powershell
npx tsc --noEmit
npm test -- --runInBand
cd web
npm run lint
npm run build
```

## Follow-Up

- Consider replacing child-process scans with a production job runner before beta deployment.
- Consider adding a parent scan-run foreign key to `store_scan_runs` when the scanner is moved to a durable job runner.
