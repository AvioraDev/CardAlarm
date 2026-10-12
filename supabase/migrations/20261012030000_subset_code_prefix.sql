-- Subset code prefix (CAR-93).
--
-- Stores print an insert card as "AM-9": a code for the subset (Alumni Mates) and the number. The checklist prints
-- the number alone. The code is stored on the subset so "AM-9" can be compared with number 9 of that subset:
-- a format comparison, not a relaxed one.
--
-- code_prefix_source: 'source' when the checklist itself prints the prefix on its card numbers;
-- 'store_codes' when it was derived from consistent codes in live store titles (listed in
-- docs/catalogue/code-prefixes.json for review).
--
-- Additive: two nullable columns. No existing row changes.

alter table public.checklist_subsets
  add column if not exists code_prefix text,
  add column if not exists code_prefix_source text check (code_prefix_source is null or code_prefix_source in ('source', 'store_codes'));
