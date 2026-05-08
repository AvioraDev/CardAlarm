# Incremental Scan Configuration

## Implementation Log

- Added explicit store-level scan configuration:
  - `scan_strategy`: `incremental` or `full`
  - `early_stop_enabled`
  - `early_stop_unchanged_pages`
- Existing and new stores default to incremental scans with early stop enabled after 2 unchanged full pages.
- The scanner now stops early only when a store is incremental, early stop is enabled, and the configured number of consecutive full pages are known and unchanged.
- Per-store scan metadata now records scan strategy, early-stop settings, whether the scan stopped early, and pages fetched.

## Behaviour

- Incremental stores stop after N consecutive full unchanged pages.
- Full-strategy stores scan until the Shopify feed ends.
- Early-stop disabled stores scan until the Shopify feed ends.
- Manual `Scan All` and `Scan Watchlist` still control matching scope; they do not override store scan strategy.

## Manual Verification

1. Open `/admin/stores`.
2. Edit a store and confirm strategy is `Incremental`, early stop is enabled, and threshold is `2`.
3. Run `/admin/scans` once to warm the cache.
4. Run the same scan again.
5. Confirm the store scan history metadata shows `stoppedEarly: true` after the threshold is reached.
6. Change the store strategy to `Full` or disable early stop and confirm a scan continues until the feed ends.
