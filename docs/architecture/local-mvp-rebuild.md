# CardAlarm Local MVP Rebuild Baseline

## 2026-05-06 Scope

This pass keeps the proof-of-concept local SQLite architecture but moves it toward the MVP model in `docs/ai/cardalarm-master-context.md`.

## What Changed

### Database
The local database now has MVP-shaped development tables in addition to the original proof-of-concept tables:

- `profiles`
- `stores`
- `store_scan_runs`
- `source_products`
- `product_snapshots`
- `product_card_matches`
- `watchlist_matches`

The existing `listings_feed` table remains for dashboard compatibility, but now includes:

- `serial_current`
- `serial_limit`
- `match_confidence`
- `match_status`
- `match_reasons`
- `unmatched_fields`
- `matcher_version`

This preserves the working app while creating room for scanner logs, raw cached products, snapshots, explainable matching, and watchlist backfill.

### Matching
The matcher is now versioned as `matcher-v3-confidence-serial`.

Matches include:

- confidence score
- confirmed/possible status
- match reasons
- unmatched fields
- serialized-card details where available

Serialized cards now support:

- limit-only formats such as `/149` and `#/299`
- exact serial formats such as `07/25`

### UI
The dashboard is still local-first and lightweight, but now presents:

- current match summary
- confirmed vs possible counts
- serialized count
- confidence badge and reasons
- cleaner responsive match cards
- polished empty states

No new UI dependencies were introduced.

## Current Constraint

The app still has no production auth implementation. The schema includes a `profiles` table and keeps future user isolation in mind, but real authentication and ownership enforcement remain a separate required phase.

## Manual Test Path

1. Run `npm run web:dev`.
2. Open `http://localhost:3000`.
3. Use `/admin` to add watchlist entries.
4. Trigger a scan from the dashboard.
5. Confirm match cards show confidence, reasons, source, price, and serial tags where relevant.
6. Filter by serialized cards to verify `is_serial` data.

## Validation Commands

- `npx tsc --noEmit`
- `npx jest --config jest.config.js --runInBand`
- `cd web && npm run lint`
- `cd web && npm run build`
