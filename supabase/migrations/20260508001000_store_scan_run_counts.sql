alter table public.store_scan_runs
  add column if not exists products_processed integer not null default 0,
  add column if not exists products_matched integer not null default 0;
