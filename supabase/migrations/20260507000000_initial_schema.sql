create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id bigserial primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stores (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  base_url text not null,
  source_type text not null default 'shopify',
  country_code text default 'NZ',
  currency text default 'NZD',
  is_active boolean not null default true,
  scan_frequency_minutes integer not null default 15,
  last_successful_scan_at timestamptz,
  last_failed_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_scan_runs (
  id bigserial primary key,
  store_id bigint references public.stores(id) on delete set null,
  store_slug text not null,
  status text not null check (status in ('running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  products_seen integer not null default 0,
  products_created integer not null default 0,
  products_updated integer not null default 0,
  products_marked_unavailable integer not null default 0,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.store_products (
  id bigserial primary key,
  store_id bigint references public.stores(id) on delete set null,
  source text not null,
  external_product_id text not null,
  handle text,
  product_url text,
  canonical_url text,
  title text,
  normalized_title text,
  description text,
  normalized_description text,
  current_price numeric(12, 2),
  currency text default 'NZD',
  current_availability boolean not null default false,
  image_url text,
  product_fingerprint text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  is_active boolean not null default true,
  raw_latest_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_product_id)
);

create table if not exists public.source_products (
  source text not null,
  external_id text not null,
  handle text,
  title text,
  price numeric(12, 2),
  available boolean not null default false,
  url text,
  image_url text,
  content_hash text not null,
  last_matched_hash text,
  last_matched_context_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_scan_token text,
  description text,
  normalized_title text,
  raw_latest_payload jsonb,
  last_checked_at timestamptz,
  primary key (source, external_id)
);

create table if not exists public.product_snapshots (
  id bigserial primary key,
  store_product_id bigint references public.store_products(id) on delete cascade,
  scan_run_id bigint,
  source text not null,
  external_id text not null,
  title text,
  description text,
  price numeric(12, 2),
  currency text default 'NZD',
  availability boolean,
  image_url text,
  raw_payload jsonb,
  content_hash text not null,
  observed_at timestamptz not null default now()
);

create table if not exists public.players (
  id bigserial primary key,
  full_name text not null,
  normalized_name text not null unique,
  sport text not null default 'basketball',
  league text default 'NBA',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.player_aliases (
  id bigserial primary key,
  player_id bigint not null references public.players(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source text,
  confidence numeric(4, 3) not null default 1,
  created_at timestamptz not null default now(),
  unique (player_id, normalized_alias)
);

create table if not exists public.teams (
  id bigserial primary key,
  name text not null,
  abbreviation text,
  league text default 'NBA',
  created_at timestamptz not null default now(),
  unique (league, name)
);

create table if not exists public.card_catalogue_sets (
  id bigserial primary key,
  brand text,
  product_line text not null,
  season text,
  sport text not null default 'basketball',
  league text default 'NBA',
  release_year integer,
  source text,
  verification_status text not null default 'seeded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, product_line, season, league)
);

create table if not exists public.card_catalogue_cards (
  id bigserial primary key,
  set_id bigint references public.card_catalogue_sets(id) on delete cascade,
  player_id bigint references public.players(id) on delete set null,
  team_id bigint references public.teams(id) on delete set null,
  card_number text,
  subset text,
  is_rookie boolean not null default false,
  is_insert boolean not null default false,
  is_autograph boolean not null default false,
  is_relic boolean not null default false,
  verification_status text not null default 'seeded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, player_id, card_number, subset)
);

create table if not exists public.card_catalogue_variants (
  id bigserial primary key,
  card_id bigint not null references public.card_catalogue_cards(id) on delete cascade,
  parallel_name text,
  normalized_parallel_name text,
  serial_limit integer,
  colour text,
  is_one_of_one boolean not null default false,
  verification_status text not null default 'seeded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, normalized_parallel_name, serial_limit)
);

create table if not exists public.reference_checklists (
  id bigserial primary key,
  year integer,
  set_name text,
  card_number text,
  player_name text
);

create table if not exists public.watchlist (
  id bigserial primary key,
  player_name text not null,
  variants text not null default '',
  target_numbers text,
  is_active boolean not null default true
);

create table if not exists public.watchlists (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  notification_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watchlist_rules (
  id bigserial primary key,
  watchlist_id bigint not null references public.watchlists(id) on delete cascade,
  player_id bigint references public.players(id) on delete set null,
  team_id bigint references public.teams(id) on delete set null,
  brand text,
  product_line text,
  season text,
  set_id bigint references public.card_catalogue_sets(id) on delete set null,
  card_number text,
  parallel text,
  rookie_only boolean not null default false,
  autograph_only boolean not null default false,
  relic_only boolean not null default false,
  serial_numbered_only boolean not null default false,
  graded_only boolean not null default false,
  raw_only boolean not null default false,
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  currency text default 'NZD',
  include_terms text,
  exclude_terms text,
  minimum_match_confidence numeric(4, 3) not null default 0.75,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.listings_feed (
  id bigserial primary key,
  external_id text not null,
  source text not null,
  title text,
  price numeric(12, 2),
  url text,
  image_url text,
  match_type text,
  is_dismissed boolean not null default false,
  is_oos boolean not null default false,
  created_at timestamptz not null default now(),
  year text,
  set_name text,
  card_number text,
  player_name text,
  variant text,
  is_serial boolean not null default false,
  serial_number text,
  is_auto boolean not null default false,
  is_rookie boolean not null default false,
  category text,
  serial_current text,
  serial_limit text,
  match_confidence numeric(5, 4),
  match_status text,
  match_reasons jsonb,
  unmatched_fields jsonb,
  matcher_version text,
  unique (source, external_id)
);

create table if not exists public.product_card_matches (
  id bigserial primary key,
  store_product_id bigint references public.store_products(id) on delete cascade,
  source text,
  external_id text,
  checklist_id bigint references public.reference_checklists(id) on delete set null,
  catalogue_card_id bigint references public.card_catalogue_cards(id) on delete set null,
  catalogue_variant_id bigint references public.card_catalogue_variants(id) on delete set null,
  matched_player_id bigint references public.players(id) on delete set null,
  matched_player_name text,
  confidence numeric(5, 4) not null,
  status text not null,
  matched_fields jsonb,
  match_reasons jsonb,
  unmatched_fields jsonb,
  matcher_version text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id, matcher_version)
);

create table if not exists public.watchlist_matches (
  id bigserial primary key,
  watchlist_id bigint not null references public.watchlists(id) on delete cascade,
  watchlist_rule_id bigint references public.watchlist_rules(id) on delete cascade,
  store_product_id bigint references public.store_products(id) on delete cascade,
  source text,
  external_id text,
  product_card_match_id bigint references public.product_card_matches(id) on delete cascade,
  confidence numeric(5, 4) not null,
  status text not null,
  first_matched_at timestamptz not null default now(),
  last_matched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_feedback (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  store_product_id bigint references public.store_products(id) on delete cascade,
  product_card_match_id bigint references public.product_card_matches(id) on delete cascade,
  feedback_type text not null,
  feedback_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id bigserial primary key,
  admin_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_runs (
  id bigserial primary key,
  mode text not null,
  status text not null default 'running',
  processed integer not null default 0,
  matched integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_reference_checklists_lookup on public.reference_checklists (set_name, card_number, player_name);
create index if not exists idx_source_products_seen on public.source_products (source, last_seen_at desc);
create index if not exists idx_source_products_available on public.source_products (available, last_checked_at desc);
create index if not exists idx_store_products_store_seen on public.store_products (store_id, last_seen_at desc);
create index if not exists idx_store_products_source_external on public.store_products (source, external_product_id);
create index if not exists idx_product_snapshots_product_observed on public.product_snapshots (store_product_id, observed_at desc);
create index if not exists idx_product_snapshots_legacy_lookup on public.product_snapshots (source, external_id, observed_at desc);
create index if not exists idx_listings_feed_status on public.listings_feed (match_status, match_confidence desc);
create index if not exists idx_listings_feed_source_external on public.listings_feed (source, external_id);
create index if not exists idx_product_card_matches_product on public.product_card_matches (store_product_id, confidence desc);
create index if not exists idx_product_card_matches_legacy on public.product_card_matches (source, external_id, matcher_version);
create index if not exists idx_watchlist_matches_watchlist on public.watchlist_matches (watchlist_id, status, last_matched_at desc);
create index if not exists idx_match_feedback_user on public.match_feedback (user_id, created_at desc);
create index if not exists idx_watchlists_user on public.watchlists (user_id, is_active);

drop trigger if exists profiles_set_updated_at on public.profiles;
drop trigger if exists stores_set_updated_at on public.stores;
drop trigger if exists store_products_set_updated_at on public.store_products;
drop trigger if exists card_catalogue_sets_set_updated_at on public.card_catalogue_sets;
drop trigger if exists card_catalogue_cards_set_updated_at on public.card_catalogue_cards;
drop trigger if exists card_catalogue_variants_set_updated_at on public.card_catalogue_variants;
drop trigger if exists watchlists_set_updated_at on public.watchlists;
drop trigger if exists watchlist_rules_set_updated_at on public.watchlist_rules;
drop trigger if exists product_card_matches_set_updated_at on public.product_card_matches;
drop trigger if exists watchlist_matches_set_updated_at on public.watchlist_matches;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores for each row execute function public.set_updated_at();
create trigger store_products_set_updated_at before update on public.store_products for each row execute function public.set_updated_at();
create trigger card_catalogue_sets_set_updated_at before update on public.card_catalogue_sets for each row execute function public.set_updated_at();
create trigger card_catalogue_cards_set_updated_at before update on public.card_catalogue_cards for each row execute function public.set_updated_at();
create trigger card_catalogue_variants_set_updated_at before update on public.card_catalogue_variants for each row execute function public.set_updated_at();
create trigger watchlists_set_updated_at before update on public.watchlists for each row execute function public.set_updated_at();
create trigger watchlist_rules_set_updated_at before update on public.watchlist_rules for each row execute function public.set_updated_at();
create trigger product_card_matches_set_updated_at before update on public.product_card_matches for each row execute function public.set_updated_at();
create trigger watchlist_matches_set_updated_at before update on public.watchlist_matches for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_rules enable row level security;
alter table public.watchlist_matches enable row level security;
alter table public.match_feedback enable row level security;

drop policy if exists "profiles are owner readable" on public.profiles;
drop policy if exists "profiles are owner writable" on public.profiles;
drop policy if exists "watchlists are owner readable" on public.watchlists;
drop policy if exists "watchlists are owner writable" on public.watchlists;
drop policy if exists "watchlist rules are owner readable" on public.watchlist_rules;
drop policy if exists "watchlist rules are owner writable" on public.watchlist_rules;
drop policy if exists "match feedback is owner readable" on public.match_feedback;
drop policy if exists "match feedback is owner writable" on public.match_feedback;

create policy "profiles are owner readable" on public.profiles for select using ((select auth.uid()) = user_id);
create policy "profiles are owner writable" on public.profiles for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "watchlists are owner readable" on public.watchlists for select using ((select auth.uid()) = user_id);
create policy "watchlists are owner writable" on public.watchlists for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "watchlist rules are owner readable" on public.watchlist_rules for select using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
create policy "watchlist rules are owner writable" on public.watchlist_rules for all using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid()))) with check (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
create policy "match feedback is owner readable" on public.match_feedback for select using ((select auth.uid()) = user_id);
create policy "match feedback is owner writable" on public.match_feedback for insert with check ((select auth.uid()) = user_id);
