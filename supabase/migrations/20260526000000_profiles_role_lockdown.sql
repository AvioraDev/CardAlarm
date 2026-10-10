-- Security: stop signed-in users from granting themselves the admin role.
--
-- profiles_update_own / profiles_insert_own only checked auth.uid() = user_id, so a
-- user holding the public publishable key and their own JWT could PATCH or POST
-- role = 'admin' straight through PostgREST. Every admin gate reads profiles.role.
--
-- Fix: authenticated users may only update display_name, and may only insert
-- their own row with the default 'user' role. Admin promotion stays a
-- service-role / direct-database operation.

revoke update on public.profiles from authenticated;
grant update (display_name, updated_at) on public.profiles to authenticated;

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = user_id and role = 'user');
