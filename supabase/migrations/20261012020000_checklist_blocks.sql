-- Checklist base-set blocks (CAR-77).
--
-- A base set is often a run of numbered blocks ("Crusade - #516-545", "Rated Rookies - #201-250") with their own
-- parallels. The importer flattened them into one "Base Set". A block is now a subset of its own whose
-- parent_subset_id is the base set it belongs to, with the card-number range the source declared.
--
-- Additive: nullable columns and an index. No existing row changes. The importer refuses to run until this is applied.

alter table public.checklist_subsets
  add column if not exists parent_subset_id bigint references public.checklist_subsets(id) on delete cascade,
  add column if not exists number_from integer,
  add column if not exists number_to integer;

create index if not exists idx_checklist_subsets_parent
  on public.checklist_subsets (parent_subset_id)
  where parent_subset_id is not null;

comment on column public.checklist_subsets.parent_subset_id is
  'The base set this block belongs to; null for a top-level subset.';

-- Rookie status is unknown (null) for products whose source marks no rookies, rather than a false "not a rookie".
-- Relaxing NOT NULL changes no existing row.
alter table public.checklist_cards alter column is_rookie drop not null;
alter table public.checklist_cards alter column is_rookie drop default;
