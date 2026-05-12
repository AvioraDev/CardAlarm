# Product Availability Events

## Status

CardAlarm records scanner-detected inventory changes in `public.product_availability_events`.

## Event Model

- `first_seen`: a product is first inserted into `store_products`.
- `restocked`: previous availability was false and the latest scan reports available.
- `sold_out`: previous availability was true and the latest scan reports unavailable or missing from the source scan.
- `price_changed`: latest scanner price differs from the previous cached price.
- `product_updated`: product fingerprint changed without an availability or price event.

Events include `store_product_id`, `store_id` where available, `source`, `external_id`, previous/current availability and price, previous/current product fingerprint, `detection_source = scanner`, `scan_token`, and `metadata`.

## Dedupe

Events use `dedupe_key = {event_type}:{store_product_id}:{scan_token}` with a unique index. Re-running the same scan token cannot create repeated identical events.

## Scope

This is backend event infrastructure only. It does not add restock UX, sealed-product UX, or customer notification changes.
