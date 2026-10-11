-- Classifier v2 (CAR-78, decisions D-005 and D-006).
--
-- 1. review_status gains 'possible' (product and player in the catalogue, row not confirmed) and
--    'unmatched' (no catalogue row). 'needs_review' stays valid for existing v1 rows.
-- 2. is_auto becomes nullable so "unknown" can be stored. Autograph status comes from the matched
--    catalogue row; with no matched row it is unknown, never "yes". Existing rows keep their values and
--    readers already coalesce is_auto against a fallback.
--
-- Additive: no row changes. Existing deterministic rows are untouched.

alter table public.product_classifications
  drop constraint if exists product_classifications_review_status_check;

alter table public.product_classifications
  add constraint product_classifications_review_status_check
  check (review_status is null or review_status in ('accepted', 'possible', 'unmatched', 'needs_review', 'out_of_scope'));

alter table public.product_classifications
  alter column is_auto drop not null,
  alter column is_auto drop default;

comment on column public.product_classifications.is_auto is
  'True/false from the matched checklist row. Null means unknown (no matched row). Deterministic rows always set it.';
