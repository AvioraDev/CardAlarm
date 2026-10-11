-- Checklist-backed catalogue: product -> subset -> cards and parallels.
--
-- The card_catalogue_* tables were backfilled from reference_checklists, where every subset-and-parallel
-- combination was stored as its own "set". These tables hold the same checklists in their real shape so a
-- classifier can pick a product, subset and parallel from closed lists. They are loaded by
-- engine/src/catalogue/import-checklists.ts and are safe to re-import: a product is replaced as a unit.

create table if not exists public.checklist_products (
  id bigserial primary key,
  season text not null,
  brand text not null,
  product_line text not null,
  normalized_product_line text not null,
  sport text not null default 'basketball',
  league text not null default 'NBA',
  source_file text,
  imported_at timestamptz not null default now(),
  unique (sport, season, normalized_product_line)
);

create table if not exists public.checklist_subsets (
  id bigserial primary key,
  product_id bigint not null references public.checklist_products(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  kind text not null check (kind in ('base', 'insert', 'autograph', 'memorabilia', 'other')),
  declared_card_count integer,
  unique (product_id, kind, normalized_name)
);

create table if not exists public.checklist_parallels (
  id bigserial primary key,
  subset_id bigint not null references public.checklist_subsets(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  serial_limit integer,
  note text
);

create table if not exists public.checklist_cards (
  id bigserial primary key,
  subset_id bigint not null references public.checklist_subsets(id) on delete cascade,
  player_id bigint references public.players(id) on delete set null,
  card_number text,
  player_name text not null,
  normalized_player_name text not null,
  team_name text,
  is_rookie boolean not null default false,
  serial_limit integer
);

create index if not exists idx_checklist_subsets_product_id on public.checklist_subsets (product_id);
create index if not exists idx_checklist_parallels_subset_id on public.checklist_parallels (subset_id);
create index if not exists idx_checklist_cards_subset_id on public.checklist_cards (subset_id);
create index if not exists idx_checklist_cards_player_id on public.checklist_cards (player_id);
create index if not exists idx_checklist_cards_normalized_player_name on public.checklist_cards (normalized_player_name);
create index if not exists idx_checklist_cards_card_number on public.checklist_cards (card_number);

alter table public.checklist_products enable row level security;
alter table public.checklist_subsets enable row level security;
alter table public.checklist_parallels enable row level security;
alter table public.checklist_cards enable row level security;

-- Reference data: readable by signed-in users, like the other catalogue tables. Writes stay with the engine.
drop policy if exists checklist_products_select_authenticated on public.checklist_products;
create policy checklist_products_select_authenticated on public.checklist_products
  for select to authenticated using (true);

drop policy if exists checklist_subsets_select_authenticated on public.checklist_subsets;
create policy checklist_subsets_select_authenticated on public.checklist_subsets
  for select to authenticated using (true);

drop policy if exists checklist_parallels_select_authenticated on public.checklist_parallels;
create policy checklist_parallels_select_authenticated on public.checklist_parallels
  for select to authenticated using (true);

drop policy if exists checklist_cards_select_authenticated on public.checklist_cards;
create policy checklist_cards_select_authenticated on public.checklist_cards
  for select to authenticated using (true);

revoke all on public.checklist_products, public.checklist_subsets, public.checklist_parallels, public.checklist_cards from anon;
grant select on public.checklist_products, public.checklist_subsets, public.checklist_parallels, public.checklist_cards to authenticated;
