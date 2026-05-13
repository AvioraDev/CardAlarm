-- CAR-21: Supabase advisor hardening for the existing remote product_classifications table.
--
-- Verification SQL after deploy:
-- select
--   c.relrowsecurity as rls_enabled,
--   p.polname,
--   p.polcmd,
--   p.polroles::regrole[] as roles
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- left join pg_policy p on p.polrelid = c.oid
-- where n.nspname = 'public'
--   and c.relname = 'product_classifications'
-- order by p.polname;
--
-- Expected:
-- - rls_enabled = true
-- - one authenticated SELECT policy named product_classifications_select_authenticated
-- - no authenticated INSERT/UPDATE/DELETE policies.
--
-- Rollback notes:
-- drop policy if exists product_classifications_select_authenticated on public.product_classifications;
-- alter table public.product_classifications disable row level security;
--
-- The table currently exists in Supabase but is not represented in the local base migration,
-- so this migration is conditional to keep fresh local database resets safe.
do $$
begin
  if to_regclass('public.product_classifications') is not null then
    execute 'alter table public.product_classifications enable row level security';

    execute 'drop policy if exists product_classifications_select_authenticated on public.product_classifications';

    execute 'create policy product_classifications_select_authenticated
      on public.product_classifications
      for select
      to authenticated
      using (true)';
  end if;
end $$;
