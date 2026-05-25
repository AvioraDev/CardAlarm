alter table public.watchlist_rules
  add column if not exists intent_type text not null default 'custom',
  add column if not exists catalogue_card_id bigint references public.card_catalogue_cards(id) on delete set null,
  add column if not exists catalogue_variant_id bigint references public.card_catalogue_variants(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'watchlist_rules_intent_type_check'
      and conrelid = 'public.watchlist_rules'::regclass
  ) then
    alter table public.watchlist_rules
      add constraint watchlist_rules_intent_type_check
      check (intent_type in ('custom', 'player', 'team', 'set', 'card', 'variant'));
  end if;
end;
$$;

create index if not exists idx_watchlist_rules_intent_type on public.watchlist_rules (intent_type);
create index if not exists idx_watchlist_rules_catalogue_card_id on public.watchlist_rules (catalogue_card_id);
create index if not exists idx_watchlist_rules_catalogue_variant_id on public.watchlist_rules (catalogue_variant_id);

comment on column public.watchlist_rules.intent_type is
  'Stage 1 catalogue-backed watchlist intent marker. Matching remains unchanged until later stages.';
comment on column public.watchlist_rules.catalogue_card_id is
  'Optional catalogue card selected by the user. Stage 1 stores this without changing matching logic.';
comment on column public.watchlist_rules.catalogue_variant_id is
  'Optional catalogue variant selected by the user. Stage 1 stores this without changing matching logic.';
