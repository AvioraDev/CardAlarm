-- Reconcile scanner/runtime schema with current store configuration code.
-- This migration is intentionally idempotent so fresh and partially migrated
-- databases converge on the same shape.

alter table public.stores
  add column if not exists scan_strategy text default 'incremental',
  add column if not exists early_stop_enabled boolean default true,
  add column if not exists early_stop_unchanged_pages integer default 2;

update public.stores
set scan_strategy = 'incremental'
where scan_strategy is null
   or scan_strategy not in ('incremental', 'full');

update public.stores
set early_stop_enabled = true
where early_stop_enabled is null;

update public.stores
set early_stop_unchanged_pages = 2
where early_stop_unchanged_pages is null
   or early_stop_unchanged_pages < 1
   or early_stop_unchanged_pages > 50;

alter table public.stores
  alter column scan_strategy set default 'incremental',
  alter column scan_strategy set not null,
  alter column early_stop_enabled set default true,
  alter column early_stop_enabled set not null,
  alter column early_stop_unchanged_pages set default 2,
  alter column early_stop_unchanged_pages set not null;

alter table public.stores
  drop constraint if exists stores_scan_strategy_check,
  add constraint stores_scan_strategy_check check (scan_strategy in ('incremental', 'full'));

alter table public.stores
  drop constraint if exists stores_early_stop_unchanged_pages_check,
  add constraint stores_early_stop_unchanged_pages_check check (early_stop_unchanged_pages between 1 and 50);

alter table public.store_scan_runs
  add column if not exists products_processed integer default 0,
  add column if not exists products_matched integer default 0;

update public.store_scan_runs
set products_processed = 0
where products_processed is null;

update public.store_scan_runs
set products_matched = 0
where products_matched is null;

alter table public.store_scan_runs
  alter column products_processed set default 0,
  alter column products_processed set not null,
  alter column products_matched set default 0,
  alter column products_matched set not null;
