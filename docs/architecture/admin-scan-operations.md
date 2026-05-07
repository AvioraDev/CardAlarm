# Admin Scan Operations

## Status

Admin users can now trigger store scans, track scan progress, and view scan history from the UI.

## Implemented

- Added `/admin/scans`.
- Added recent scan run query support.
- Reused the scan trigger/polling panel on the dedicated admin scans page.
- Added scan run history table with mode, status, processed count, matched count, timestamps, and errors.
- Linked scan operations from the admin page and header navigation.
- Updated engine scan execution to write source-level progress to `scan_runs`.
- Promoted the only current local profile to `admin` so the scan UI is reachable.

## Runtime Behavior

The scan UI supports:

- `Scan Watchlist`
- `Scan All`
- live polling through `/api/scan-status`
- optimistic running state
- recent scan status/history

Progress is updated after each source completes.
This is enough for MVP visibility without adding a separate job runner yet.

## Manual Test Plan

1. Sign in.
2. Open `/admin/scans`.
3. Click `Scan All`.
4. Confirm status changes to running.
5. Confirm processed/matched counts update as sources complete.
6. Confirm the scan run appears in Recent Runs.
7. Confirm failures show in the Error column if a source fails.
8. Open `/dashboard?mode=all` after completion and confirm cached listings are visible.

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
- Add per-source progress rows once `store_scan_runs` is fully wired into the engine.
