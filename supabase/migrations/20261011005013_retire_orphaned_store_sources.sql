-- Two source labels have no row in public.stores, so they are never rescanned and their products
-- stay "available" forever:
--   'sports-cards-nz' : an old label for the 'spnz' store. Every one of its products also exists under 'spnz'.
--   'Icons of Sport'  : a store that was never added to public.stores.
-- Retire them so stale listings stop surfacing. Rows are kept for history; nothing is deleted.

with retired as (
  update public.store_products sp
  set current_availability = false,
      is_active = false,
      updated_at = now()
  where sp.store_id is null
    and sp.source in ('sports-cards-nz', 'Icons of Sport')
    and (sp.current_availability = true or sp.is_active = true)
  returning sp.id, sp.source, sp.external_product_id, sp.current_price, sp.product_fingerprint
)
insert into public.product_availability_events (
  store_product_id,
  store_id,
  source,
  external_id,
  event_type,
  detection_source,
  scan_token,
  previous_availability,
  current_availability,
  previous_price,
  current_price,
  previous_product_fingerprint,
  current_product_fingerprint,
  dedupe_key,
  metadata
)
select
  r.id,
  null,
  r.source,
  r.external_product_id,
  'sold_out',
  'system',
  'retire_orphaned_store_sources',
  true,
  false,
  r.current_price,
  r.current_price,
  r.product_fingerprint,
  r.product_fingerprint,
  'sold_out:' || r.id || ':retire_orphaned_store_sources',
  jsonb_build_object('source', r.source, 'externalId', r.external_product_id, 'reason', 'orphaned_source_retired')
from retired r
on conflict (dedupe_key) do nothing;

update public.source_products
set available = false
where source in ('sports-cards-nz', 'Icons of Sport')
  and available = true;

update public.listings_feed
set is_oos = true
where source in ('sports-cards-nz', 'Icons of Sport')
  and is_oos = false;

-- hobbylife.co.nz does not serve a Shopify product feed (products.json returns 404), so every scan of it fails.
update public.stores
set is_active = false,
    updated_at = now()
where slug = 'hobbylife'
  and is_active = true;
