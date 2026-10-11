-- Columns for the Jev classifier (classifier_type = 'jev'), which resolves listings to checklist catalogue
-- rows instead of free text. Deterministic rows leave these null, so both classifiers share the table and
-- the Jev rows can run in shadow until readers are switched over.

alter table public.product_classifications
  add column if not exists item_type text,
  add column if not exists sport text,
  add column if not exists player_id bigint references public.players(id) on delete set null,
  add column if not exists checklist_product_id bigint references public.checklist_products(id) on delete set null,
  add column if not exists checklist_subset_id bigint references public.checklist_subsets(id) on delete set null,
  add column if not exists checklist_card_id bigint references public.checklist_cards(id) on delete set null,
  add column if not exists checklist_parallel_id bigint references public.checklist_parallels(id) on delete set null,
  add column if not exists grader text,
  add column if not exists grade text,
  add column if not exists evidence_hash text,
  add column if not exists review_status text,
  add column if not exists review_reasons jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_classifications_review_status_check'
      and conrelid = 'public.product_classifications'::regclass
  ) then
    alter table public.product_classifications
      add constraint product_classifications_review_status_check
      check (review_status is null or review_status in ('accepted', 'needs_review', 'out_of_scope'));
  end if;
end;
$$;

create index if not exists idx_product_classifications_jev_review_status
  on public.product_classifications (review_status)
  where classifier_type = 'jev';
create index if not exists idx_product_classifications_player_id
  on public.product_classifications (player_id)
  where player_id is not null;
create index if not exists idx_product_classifications_checklist_product_id
  on public.product_classifications (checklist_product_id)
  where checklist_product_id is not null;
create index if not exists idx_product_classifications_checklist_subset_id
  on public.product_classifications (checklist_subset_id)
  where checklist_subset_id is not null;
create index if not exists idx_product_classifications_checklist_card_id
  on public.product_classifications (checklist_card_id)
  where checklist_card_id is not null;
create index if not exists idx_product_classifications_checklist_parallel_id
  on public.product_classifications (checklist_parallel_id)
  where checklist_parallel_id is not null;
