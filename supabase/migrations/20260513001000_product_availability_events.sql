create table if not exists public.product_availability_events (
  id bigserial primary key,
  store_product_id bigint not null references public.store_products(id) on delete cascade,
  store_id bigint references public.stores(id) on delete set null,
  source text not null,
  external_id text not null,
  event_type text not null check (event_type in ('first_seen', 'restocked', 'sold_out', 'price_changed', 'product_updated')),
  detection_source text not null default 'scanner',
  scan_token text not null,
  previous_availability boolean,
  current_availability boolean,
  previous_price numeric(12, 2),
  current_price numeric(12, 2),
  previous_product_fingerprint text,
  current_product_fingerprint text,
  dedupe_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_product_availability_events_dedupe_key
  on public.product_availability_events (dedupe_key);

create index if not exists idx_product_availability_events_product_created
  on public.product_availability_events (store_product_id, created_at desc);

create index if not exists idx_product_availability_events_source_external_created
  on public.product_availability_events (source, external_id, created_at desc);

create index if not exists idx_product_availability_events_type_created
  on public.product_availability_events (event_type, created_at desc);

create index if not exists idx_product_availability_events_store_created
  on public.product_availability_events (store_id, created_at desc);

alter table public.product_availability_events enable row level security;

drop policy if exists product_availability_events_select_authenticated on public.product_availability_events;
create policy product_availability_events_select_authenticated
  on public.product_availability_events
  for select to authenticated
  using (true);
