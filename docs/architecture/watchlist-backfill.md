# Watchlist Backfill

## Status

Phase 9 is implemented for MVP-scale cached inventory matching.
Creating a user-owned watchlist now immediately evaluates its first structured rule against canonical cached inventory and writes deduplicated `watchlist_matches`.

## Implemented

- Added `web/src/lib/watchlist-backfill.ts`.
- Added canonical SQL helpers in `web/src/lib/watchlist-backfill-sql.ts`.
- Added a Postgres transaction helper in `web/src/lib/db.ts`.
- Added a partial unique index for duplicate prevention on `watchlist_matches`.
- Added owner-scoped RLS policies for inserting, updating, and deleting `watchlist_matches`.
- Applied the migration to Supabase through MCP.
- Backfill runs after watchlist creation.
- Backfill runs when an inactive watchlist is reactivated.
- Added a manual `Refresh Matches` action on `/watchlists/[id]`.
- Watchlist index and detail pages now show cached match counts.

## Matching Approach

This is intentionally rules-first and explainable.
For MVP backfill, a cached store product can match when current canonical inventory satisfies the structured watchlist rule:

- include terms against store product title/description and available product-card match data
- exclude terms
- brand
- product line / set
- season
- card number
- parallel
- rookie/autograph/serial flags
- relic/graded/raw text constraints
- min/max price
- current availability

The backfill starts from active/current `store_products` and links to the best available `product_card_matches` row.
Confidence uses the strongest available value from `product_card_matches` or the rule minimum confidence.

## Duplicate Prevention

Matches are deduplicated by:

- `watchlist_id`
- `watchlist_rule_id`
- `source`
- `external_id`

Refreshing a watchlist updates existing rows instead of creating duplicates.

## Safety Guard

An empty rule with no positive criteria returns zero matches.
This avoids accidentally matching all cached inventory.

## Current Limitations

- Backfill still uses text heuristics over product title/description when catalogue matching is unavailable.
- Existing product-card matching quality still depends on the current matcher.
- Rule editing is not yet implemented.

## Manual Test Plan

1. Sign in.
2. Open `/watchlists/new`.
3. Create a watchlist with include terms likely to match cached data, for example `LeBron James` or `Prizm`.
4. Confirm redirect to `/watchlists/[id]`.
5. Confirm the cached match count is greater than zero when cached listings match.
6. Click `Refresh Matches`.
7. Confirm the match count stays stable and does not duplicate.
8. Pause and reactivate the watchlist.
9. Confirm reactivation refreshes matches.

## Commands

```powershell
npx tsc --noEmit
npm test -- --runInBand
cd web
npm run lint
npm run build
```

## Next MVP Task

Improve matching and watchlist operations:

- improve catalogue/product-card matching quality before backfill
- add rule editing
- keep legacy `listings_feed` available only as an admin/compatibility view
