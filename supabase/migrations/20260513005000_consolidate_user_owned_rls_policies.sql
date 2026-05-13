-- CAR-22: remove legacy broad RLS policies after equivalent authenticated
-- owner-scoped policies have been established.
--
-- Verified before writing this migration:
-- - profiles_select_own / profiles_update_own / profiles_insert_own exist.
-- - watchlists_select_own / insert_own / update_own / delete_own exist.
-- - watchlist_rules_select_own / insert_own / update_own / delete_own exist.
-- - match_feedback_select_own / insert_own exist.
--
-- The policies dropped below were created by the initial schema as public-role
-- permissive policies. They duplicate the current authenticated policies and
-- trigger Supabase "multiple permissive policies" advisor warnings.
drop policy if exists "profiles are owner readable" on public.profiles;
drop policy if exists "profiles are owner writable" on public.profiles;

drop policy if exists "watchlists are owner readable" on public.watchlists;
drop policy if exists "watchlists are owner writable" on public.watchlists;

drop policy if exists "watchlist rules are owner readable" on public.watchlist_rules;
drop policy if exists "watchlist rules are owner writable" on public.watchlist_rules;

drop policy if exists "match feedback is owner readable" on public.match_feedback;
drop policy if exists "match feedback is owner writable" on public.match_feedback;

-- Verification SQL after deploy:
-- select tablename, cmd, roles, count(*) as policy_count
-- from pg_policies
-- where schemaname = 'public'
--   and tablename in ('watchlists', 'watchlist_rules', 'profiles', 'match_feedback')
-- group by tablename, cmd, roles
-- order by tablename, cmd, roles;
--
-- Expected modern policies:
-- - profiles: authenticated INSERT, SELECT, UPDATE
-- - watchlists: authenticated INSERT, SELECT, UPDATE, DELETE
-- - watchlist_rules: authenticated INSERT, SELECT, UPDATE, DELETE
-- - match_feedback: authenticated INSERT, SELECT
-- - no policies with roles = {public} on these tables.
--
-- Advisor verification:
-- Re-run Supabase performance advisors and confirm duplicate permissive policy
-- warnings are gone for the target tables.
