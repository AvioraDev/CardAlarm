# Scanner Batch Product Persistence

## Implementation Log

- Refactored `upsertSourceProducts()` to persist product pages with batched SQL instead of per-product insert/update loops.
- Preserved the existing scanner contract: `SourceProductCacheInput[]` in, `SourceProductCacheStatus[]` out.
- Kept source product caching, canonical store product upserts, snapshot creation, content-hash comparison, and match-context decisions intact.
- Product snapshots are still created only when a product is new or its `content_hash` changes.
- `product_snapshots.store_product_id` is now populated from the batched `store_products` upsert result instead of per-product ID lookups.

## Remaining Performance Debt

- Matched listing writes still happen one product at a time after cache filtering.
- `markSourceProductsMatched()` still updates matched hashes in a loop.
- Scanner execution is still a child process rather than a durable job worker.
