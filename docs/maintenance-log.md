# Maintenance Log

## 2026-05-05: Ingestion Match Cache Typecheck Fix

### Context
The engine failed TypeScript validation because `runIngestionCycle` called `processListingWithCache` with four arguments, while the matcher requires five. The missing argument was the preloaded checklist player-name list used to reject stealth false positives when a listing already names a non-watchlist player.

### Change
- Updated `engine/src/ingest.ts` to import `getAllChecklistPlayerNames`.
- Preloaded all checklist player names once per ingestion cycle.
- Passed the cached player-name list into `processListingWithCache` for every product.

### Result
This preserves the intended no-N+1-query design while restoring the engine/web contract between ingestion and matching.
