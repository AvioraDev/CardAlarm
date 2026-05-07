create unique index if not exists idx_watchlist_matches_dedupe
  on public.watchlist_matches (
    watchlist_id,
    watchlist_rule_id,
    source,
    external_id
  )
  where source is not null and external_id is not null;

drop policy if exists watchlist_matches_insert_own on public.watchlist_matches;
drop policy if exists watchlist_matches_update_own on public.watchlist_matches;
drop policy if exists watchlist_matches_delete_own on public.watchlist_matches;

create policy watchlist_matches_insert_own on public.watchlist_matches
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_id
        and w.user_id = (select auth.uid())
    )
  );

create policy watchlist_matches_update_own on public.watchlist_matches
  for update to authenticated
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_id
        and w.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_id
        and w.user_id = (select auth.uid())
    )
  );

create policy watchlist_matches_delete_own on public.watchlist_matches
  for delete to authenticated
  using (
    exists (
      select 1
      from public.watchlists w
      where w.id = watchlist_id
        and w.user_id = (select auth.uid())
    )
  );
