create table if not exists public.scan_jobs (
  id bigserial primary key,
  scan_run_id bigint references public.scan_runs(id) on delete set null,
  mode text not null check (mode in ('watchlist', 'full', 'shallow')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_kind text not null default 'admin' check (requested_by_kind in ('admin', 'schedule', 'system')),
  priority integer not null default 100,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancel_requested_at timestamptz,
  cancel_requested_by uuid references auth.users(id) on delete set null,
  processed integer not null default 0,
  matched integer not null default 0,
  failed_stores integer not null default 0,
  completed_stores integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_scan_jobs (
  id bigserial primary key,
  scan_job_id bigint not null references public.scan_jobs(id) on delete cascade,
  store_scan_run_id bigint references public.store_scan_runs(id) on delete set null,
  store_id bigint references public.stores(id) on delete set null,
  store_slug text not null,
  store_name text not null,
  base_url text not null,
  scan_mode text not null check (scan_mode in ('watchlist', 'full', 'shallow')),
  scan_strategy text not null check (scan_strategy in ('shallow', 'incremental', 'full')),
  early_stop_enabled boolean not null default true,
  early_stop_unchanged_pages integer not null default 2 check (early_stop_unchanged_pages between 1 and 50),
  page_concurrency integer not null default 1 check (page_concurrency between 1 and 5),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled', 'timed_out')),
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancel_requested_at timestamptz,
  cancel_requested_by uuid references auth.users(id) on delete set null,
  products_seen integer not null default 0,
  products_processed integer not null default 0,
  products_matched integer not null default 0,
  products_marked_unavailable integer not null default 0,
  pages_fetched integer not null default 0,
  last_page_fetched integer,
  stop_reason text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists scan_jobs_set_updated_at on public.scan_jobs;
create trigger scan_jobs_set_updated_at
  before update on public.scan_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists store_scan_jobs_set_updated_at on public.store_scan_jobs;
create trigger store_scan_jobs_set_updated_at
  before update on public.store_scan_jobs
  for each row execute function public.set_updated_at();

create index if not exists idx_scan_jobs_claimable
  on public.scan_jobs (priority asc, created_at asc)
  where status = 'queued';

create index if not exists idx_scan_jobs_running_heartbeat
  on public.scan_jobs (heartbeat_at)
  where status = 'running';

create index if not exists idx_scan_jobs_recent
  on public.scan_jobs (created_at desc);

create index if not exists idx_scan_jobs_scan_run
  on public.scan_jobs (scan_run_id)
  where scan_run_id is not null;

create index if not exists idx_store_scan_jobs_queue_claimable
  on public.store_scan_jobs (created_at asc)
  where status = 'queued';

create index if not exists idx_store_scan_jobs_running_heartbeat
  on public.store_scan_jobs (heartbeat_at)
  where status = 'running';

create index if not exists idx_store_scan_jobs_parent_status
  on public.store_scan_jobs (scan_job_id, status);

create index if not exists idx_store_scan_jobs_store_recent
  on public.store_scan_jobs (store_id, created_at desc)
  where store_id is not null;

alter table public.scan_jobs enable row level security;
alter table public.store_scan_jobs enable row level security;
