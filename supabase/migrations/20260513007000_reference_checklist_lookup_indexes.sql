create index if not exists idx_reference_checklists_card_number
  on public.reference_checklists (card_number);

create index if not exists idx_reference_checklists_card_number_set_name
  on public.reference_checklists (card_number, set_name);

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_reference_checklists_set_name_trgm
  on public.reference_checklists
  using gin (set_name extensions.gin_trgm_ops);
