# User Watchlist CRUD

## Status

Phase 8 of the MVP build is now implemented at the UI and persistence layer.
Authenticated users can create, view, pause, activate, and delete their own watchlists with one structured rule per watchlist.

## Implemented

- Replaced the `/watchlists` placeholder with a protected watchlist index.
- Added `/watchlists/new` for structured watchlist creation.
- Added `/watchlists/[id]` for watchlist detail and rule review.
- Added Supabase/RLS-backed query helpers in `web/src/lib/watchlists.ts`.
- Added server actions in `web/src/lib/watchlist-actions.ts`.
- Added TypeScript row types for user-owned watchlists and rules.

## Structured Rule Fields

The first rule form captures MVP-relevant filters:

- name
- include terms
- exclude terms
- brand
- product line / set
- season
- card number
- parallel
- rookie only
- autograph only
- relic only
- serial numbered only
- graded only
- raw only
- min price
- max price
- minimum match confidence
- currency defaults to `NZD`

## Security Model

Watchlist operations use the authenticated Supabase server client and existing RLS policies:

- `watchlists_*_own`
- `watchlist_rules_*_own`

Server actions still call `requireUser()` before any mutation.
Deletes and updates include the authenticated user's `user_id` on `watchlists` queries.

## Current Limitations

- Editing an existing rule is not implemented yet.
- Multiple rules per watchlist are not exposed in the UI yet.
- Watchlist backfill is not implemented in this phase.
- Dashboard still reads compatibility `listings_feed`; it does not yet filter by `watchlist_matches`.

## Manual Test Plan

1. Sign in.
2. Open `/watchlists`.
3. Create a watchlist from `/watchlists/new`.
4. Confirm redirect to `/watchlists/[id]`.
5. Confirm the structured rule values display correctly.
6. Return to `/watchlists`.
7. Pause and reactivate the watchlist.
8. Delete the watchlist.
9. Confirm another signed-in user cannot see the deleted/created watchlist.

## Commands

```powershell
npm test -- --runInBand
cd web
npm run lint
npm run build
```

## Next MVP Task

Implement Phase 9: watchlist backfill.
Creating or updating a watchlist should evaluate cached inventory and existing `product_card_matches`, then create deduplicated `watchlist_matches`.
