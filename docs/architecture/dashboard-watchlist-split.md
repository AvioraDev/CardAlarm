# Dashboard Watchlist Split

## Status

The dashboard now follows the intended MVP operating model:

- default view shows only the signed-in user's watchlist matches
- secondary browse mode shows all current cached listings
- store scans and cached inventory remain independent from watchlist creation

## Implemented

- Added `getUserWatchlistFeed()` for user-owned `watchlist_matches`.
- Added `getUserWatchlistStats()` for dashboard counts.
- Updated `/dashboard` to default to My Matches.
- Added `/dashboard?mode=all` for Browse All cached listings.
- Browse All reads canonical cached inventory from `store_products`.
- Browse All keeps practical filters for cached inventory: source, title search, price, matched player, match status, serial, auto, and rookie signals.
- My Matches hides legacy global dismiss actions.
- Dashboard copy now explains cached inventory and watchlist backfill.

## Data Sources

Default dashboard:

- `watchlist_matches`
- `watchlists`
- `listings_feed`

Browse All:

- `store_products`
- optional best `product_card_matches` row per product

This keeps compatibility data available for watchlist mode while moving browse-all inventory to the canonical cache. `listings_feed` remains in use for the existing watchlist match compatibility path until watchlist backfill and dashboard joins are moved to canonical inventory in a later task.

## Manual Test Plan

1. Sign in.
2. Create or refresh a watchlist that has cached matches.
3. Open `/dashboard`.
4. Confirm My Matches is selected by default.
5. Confirm only watchlist-backed cards are shown.
6. Open `/dashboard?mode=all`.
7. Confirm Browse All shows all cached listings and filters.
8. Confirm Browse All copy clearly says listings may not be on the watchlist.

## Commands

```powershell
npx tsc --noEmit
npm test -- --runInBand
cd web
npm run lint
npm run build
```

## Next MVP Task

Run the engine scanner against configured stores, then test the full loop:

1. scan stores
2. create watchlist
3. backfill cached matches
4. view My Matches
5. browse all cached listings
6. delete watchlist and confirm My Matches updates
