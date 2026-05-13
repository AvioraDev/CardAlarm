-- CAR-23: cover alert foreign keys flagged by Supabase performance advisors.
--
-- Concurrent index creation was considered, but Supabase CLI migrations are
-- applied through the migration runner; plain IF NOT EXISTS indexes keep this
-- migration compatible with local reset and remote push workflows.
create index if not exists idx_alerts_product_card_match_id
  on public.alerts (product_card_match_id);

create index if not exists idx_alerts_watchlist_match_id
  on public.alerts (watchlist_match_id);

-- Verification SQL after deploy:
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and tablename = 'alerts'
--   and indexname in (
--     'idx_alerts_product_card_match_id',
--     'idx_alerts_watchlist_match_id'
--   )
-- order by indexname;
--
-- Advisor verification:
-- Re-run Supabase performance advisors and confirm there are no remaining
-- unindexed foreign-key warnings for:
-- - public.alerts.product_card_match_id
-- - public.alerts.watchlist_match_id
