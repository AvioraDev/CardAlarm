create index if not exists idx_store_products_active_current_recent
  on public.store_products (last_checked_at desc nulls last, last_seen_at desc, created_at desc, id)
  where is_active = true and current_availability = true;

create index if not exists idx_store_products_active_source_price
  on public.store_products (source, current_price, last_checked_at desc)
  where is_active = true and current_availability = true;

create index if not exists idx_product_card_matches_product_confidence_recent
  on public.product_card_matches (store_product_id, confidence desc, updated_at desc);

create index if not exists idx_watchlist_matches_watchlist_product_recent
  on public.watchlist_matches (watchlist_id, store_product_id, last_matched_at desc);

create index if not exists idx_watchlist_matches_product_recent
  on public.watchlist_matches (store_product_id, last_matched_at desc);

create index if not exists idx_match_feedback_user_product_type_recent
  on public.match_feedback (user_id, store_product_id, feedback_type, created_at desc, id desc);

create index if not exists idx_watchlists_user_active_updated
  on public.watchlists (user_id, is_active, updated_at desc, id);

create index if not exists idx_stores_admin_list
  on public.stores (is_active desc, name asc);

create index if not exists idx_scan_runs_running_started
  on public.scan_runs (started_at desc)
  where status = 'running';

create index if not exists idx_scan_runs_started_recent
  on public.scan_runs (started_at desc);

create index if not exists idx_store_scan_runs_running_store
  on public.store_scan_runs (store_id, store_slug, started_at desc)
  where status = 'running';

create index if not exists idx_store_scan_runs_started_recent
  on public.store_scan_runs (started_at desc);

do $$
begin
  if to_regclass('public.product_classifications') is not null then
    execute 'create index if not exists idx_product_classifications_latest_deterministic
      on public.product_classifications (store_product_id, updated_at desc)
      where classifier_type = ''deterministic''';

    execute 'create index if not exists idx_product_classifications_deterministic_year
      on public.product_classifications (year)
      where classifier_type = ''deterministic'' and year is not null';

    execute 'create index if not exists idx_product_classifications_deterministic_category
      on public.product_classifications (category)
      where classifier_type = ''deterministic'' and category is not null';

    execute 'create index if not exists idx_product_classifications_deterministic_player
      on public.product_classifications (player_name)
      where classifier_type = ''deterministic'' and player_name is not null';

    execute 'create index if not exists idx_product_classifications_deterministic_set
      on public.product_classifications ((coalesce(set_name, product_line)))
      where classifier_type = ''deterministic'' and coalesce(set_name, product_line) is not null';

    execute 'create index if not exists idx_product_classifications_deterministic_variant
      on public.product_classifications ((coalesce(variant_name, parallel_name, insert_name)))
      where classifier_type = ''deterministic'' and coalesce(variant_name, parallel_name, insert_name) is not null';

    execute 'create index if not exists idx_product_classifications_deterministic_flags
      on public.product_classifications (is_serial, is_auto, is_rookie)
      where classifier_type = ''deterministic''';
  end if;
end $$;
