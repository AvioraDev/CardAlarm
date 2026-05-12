create table if not exists public.alerts (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  watchlist_id bigint not null references public.watchlists(id) on delete cascade,
  watchlist_match_id bigint references public.watchlist_matches(id) on delete set null,
  store_product_id bigint not null references public.store_products(id) on delete cascade,
  product_card_match_id bigint references public.product_card_matches(id) on delete set null,
  event_type text not null default 'new_watchlist_match' check (event_type = 'new_watchlist_match'),
  channel text not null default 'email' check (channel = 'email'),
  status text not null check (status in ('pending', 'sent', 'failed', 'suppressed')),
  dedupe_key text not null,
  recipient_email text,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  provider text,
  provider_message_id text,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_alerts_dedupe_key on public.alerts (dedupe_key);
create index if not exists idx_alerts_user_created_at on public.alerts (user_id, created_at desc);
create index if not exists idx_alerts_retry on public.alerts (status, next_attempt_at, attempts) where status in ('pending', 'failed');
create index if not exists idx_alerts_watchlist on public.alerts (watchlist_id, created_at desc);
create index if not exists idx_alerts_store_product on public.alerts (store_product_id);

drop trigger if exists alerts_set_updated_at on public.alerts;
create trigger alerts_set_updated_at before update on public.alerts for each row execute function public.set_updated_at();

alter table public.alerts enable row level security;

drop policy if exists alerts_select_own on public.alerts;
create policy alerts_select_own on public.alerts
  for select to authenticated
  using ((select auth.uid()) = user_id);
