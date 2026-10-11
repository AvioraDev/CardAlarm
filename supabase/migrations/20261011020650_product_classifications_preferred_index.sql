-- Readers pick one classification per listing: the Jev row when there is one, else the deterministic row.
-- This index returns that row directly, in order, so the per-listing lookup needs no sort.
create index if not exists idx_product_classifications_preferred
  on public.product_classifications (store_product_id, (classifier_type = 'jev') desc, updated_at desc)
  where classifier_type in ('jev', 'deterministic');

analyze public.product_classifications;
