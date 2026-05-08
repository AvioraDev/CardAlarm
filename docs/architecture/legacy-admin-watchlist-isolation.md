# Legacy Admin Watchlist Isolation

## Implementation Log

- Removed the legacy global watchlist management panel from `/admin`.
- Removed the old admin-only add, delete, and activate actions for the `watchlist` compatibility table.
- Removed the unused legacy `WatchlistTable` component.
- Kept user-owned watchlists unchanged under `/watchlists`.
- Kept scanner/runtime compatibility unchanged; the old `watchlist` table still exists and is not dropped in this phase.

## Current Admin Surface

- `/admin` now links admins to operational configuration only:
  - `/admin/stores`
  - `/admin/scans`

## Remaining Compatibility Debt

- Engine compatibility paths still reference the old global `watchlist` table.
- `listings_feed` still exists for legacy writes, dismiss actions, migrations, and historical compatibility.
