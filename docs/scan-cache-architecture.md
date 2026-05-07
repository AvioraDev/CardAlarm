# Scan Cache Architecture

## 2026-05-05: Cached Store Scanning

### Goal
Reduce scan time by caching each Shopify product locally and only re-running the match engine when a product is new, changed, or the watchlist/matcher context has changed.

### Source Product Cache
The engine now maintains a `source_products` table keyed by `(source, external_id)`.

Stored fields include:
- `handle`, `title`, `price`, `available`, `url`, `image_url`
- `content_hash`, derived from the product fields that affect matching/display
- `last_matched_hash`, the product hash last evaluated by the matcher
- `last_matched_context_hash`, the watchlist/matcher context used for that evaluation
- `first_seen_at`, `last_seen_at`, and `last_seen_scan_token`

### Scan Flow
1. Fetch Shopify products in paged batches.
2. Upsert every fetched product into `source_products`.
3. Skip products whose `content_hash` and `last_matched_context_hash` are unchanged.
4. Match only new/changed products or products affected by watchlist/matcher changes.
5. Mark processed cache rows with the hash/context that was evaluated.
6. On complete source scans, mark cached products missing from the source as unavailable and mark matching feed rows `is_oos = 1`.

### Early Stop
The scanner stops paginating after consecutive full pages are already cached and unchanged. This avoids walking the entire historical catalogue on every scan.

Important constraint: OOS reconciliation is skipped when early-stop occurs, because the scan did not see the full source inventory. Full source scans still reconcile missing products.

### Availability Watchdog
The watchdog now fetches source inventory pages instead of checking each active listing URL one-by-one. This is substantially faster and avoids thousands of serial product requests.

OOS reconciliation only runs when the source inventory fetch completes successfully. If a page fails, the watchdog skips reconciliation for that source to avoid false OOS marks.

### Watchlist Changes
The cache key includes a match context hash derived from the active watchlist and matcher version. If the watchlist changes, unchanged cached products are reprocessed once under the new context.

### Operational Notes
- This design still fetches Shopify pages, but avoids rematching unchanged products.
- Early-stop depends on product ordering remaining stable enough that unchanged pages indicate older unchanged catalogue pages.
- If matcher logic changes, bump `MATCHER_VERSION` in `engine/src/ingest.ts` so cached products are re-evaluated.
