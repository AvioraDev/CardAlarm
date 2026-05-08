alter table public.stores
  add column if not exists scan_strategy text not null default 'incremental',
  add column if not exists early_stop_enabled boolean not null default true,
  add column if not exists early_stop_unchanged_pages integer not null default 2;

alter table public.stores
  drop constraint if exists stores_scan_strategy_check,
  add constraint stores_scan_strategy_check check (scan_strategy in ('incremental', 'full'));

alter table public.stores
  drop constraint if exists stores_early_stop_unchanged_pages_check,
  add constraint stores_early_stop_unchanged_pages_check check (early_stop_unchanged_pages between 1 and 50);
