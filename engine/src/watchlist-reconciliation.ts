import type { DbClient } from './db';

export async function reconcileActiveWatchlistMatches(db: DbClient): Promise<number> {
  const result = await db.query(
    `insert into public.watchlist_matches (
       watchlist_id,
       watchlist_rule_id,
       store_product_id,
       source,
       external_id,
       product_card_match_id,
       confidence,
       status,
       first_matched_at,
       last_matched_at
     )
     select
       w.id,
       wr.id,
       sp.id,
       sp.source,
       sp.external_product_id,
       pcm.id,
       greatest(coalesce(pcm.confidence, 0), coalesce(wr.minimum_match_confidence, 0.75))::numeric(5, 4),
       case
         when pcm.status = 'possible'
           or greatest(coalesce(pcm.confidence, 0), coalesce(wr.minimum_match_confidence, 0.75)) < 0.75
           then 'possible'
         else 'current'
       end,
       now(),
       now()
     from public.watchlist_rules wr
     join public.watchlists w on w.id = wr.watchlist_id
     join public.store_products sp on sp.is_active = true and sp.current_availability = true
     left join lateral (
       select *
       from public.product_card_matches pcm
       where pcm.store_product_id = sp.id
       order by pcm.confidence desc, pcm.updated_at desc
       limit 1
     ) pcm on true
     where w.is_active = true
       and (
         wr.player_id is not null
         or nullif(wr.include_terms, '') is not null
         or nullif(wr.brand, '') is not null
         or nullif(wr.product_line, '') is not null
         or nullif(wr.season, '') is not null
         or nullif(wr.card_number, '') is not null
         or nullif(wr.parallel, '') is not null
         or wr.rookie_only = true
         or wr.autograph_only = true
         or wr.relic_only = true
         or wr.serial_numbered_only = true
         or wr.graded_only = true
         or wr.raw_only = true
       )
       and (wr.player_id is null or pcm.matched_player_id = wr.player_id)
       and not exists (
         select 1
         from regexp_split_to_table(coalesce(wr.include_terms, ''), '[,\n]') term
         where nullif(trim(term), '') is not null
           and not (
             coalesce(sp.title, '') ilike '%' || trim(term) || '%'
             or coalesce(sp.description, '') ilike '%' || trim(term) || '%'
             or coalesce(pcm.matched_player_name, '') ilike '%' || trim(term) || '%'
             or coalesce(pcm.match_reasons::text, '') ilike '%' || trim(term) || '%'
             or coalesce(pcm.matched_fields::text, '') ilike '%' || trim(term) || '%'
           )
       )
       and not exists (
         select 1
         from regexp_split_to_table(coalesce(wr.exclude_terms, ''), '[,\n]') term
         where nullif(trim(term), '') is not null
           and (
             coalesce(sp.title, '') ilike '%' || trim(term) || '%'
             or coalesce(sp.description, '') ilike '%' || trim(term) || '%'
             or coalesce(pcm.matched_player_name, '') ilike '%' || trim(term) || '%'
             or coalesce(pcm.match_reasons::text, '') ilike '%' || trim(term) || '%'
             or coalesce(pcm.matched_fields::text, '') ilike '%' || trim(term) || '%'
           )
       )
       and (wr.brand is null or coalesce(sp.title, '') ilike '%' || wr.brand || '%' or coalesce(sp.description, '') ilike '%' || wr.brand || '%' or coalesce(pcm.match_reasons::text, '') ilike '%' || wr.brand || '%')
       and (wr.product_line is null or coalesce(sp.title, '') ilike '%' || wr.product_line || '%' or coalesce(sp.description, '') ilike '%' || wr.product_line || '%' or coalesce(pcm.match_reasons::text, '') ilike '%' || wr.product_line || '%')
       and (wr.season is null or coalesce(sp.title, '') ilike '%' || wr.season || '%' or coalesce(sp.description, '') ilike '%' || wr.season || '%')
       and (
         wr.card_number is null
         or coalesce(sp.title, '') ilike '%#' || wr.card_number || '%'
         or coalesce(sp.description, '') ilike '%#' || wr.card_number || '%'
         or coalesce(sp.title, '') ~ ('(^|[^0-9])' || wr.card_number || '([^0-9]|$)')
       )
       and (wr.parallel is null or coalesce(sp.title, '') ilike '%' || wr.parallel || '%' or coalesce(sp.description, '') ilike '%' || wr.parallel || '%' or coalesce(pcm.match_reasons::text, '') ilike '%' || wr.parallel || '%')
       and (wr.rookie_only = false or coalesce(sp.title, '') ~* '\\m(rc|rookie)\\M')
       and (wr.autograph_only = false or coalesce(sp.title, '') ~* '\\m(auto|autograph)\\M')
       and (wr.relic_only = false or coalesce(sp.title, '') ilike '%relic%' or coalesce(sp.description, '') ilike '%relic%')
       and (wr.serial_numbered_only = false or coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial' or coalesce(sp.title, '') ~ '/[0-9]+')
       and (wr.graded_only = false or coalesce(sp.title, '') ilike '%graded%' or coalesce(sp.title, '') ilike '%psa%' or coalesce(sp.title, '') ilike '%bgs%')
       and (wr.raw_only = false or (coalesce(sp.title, '') not ilike '%graded%' and coalesce(sp.title, '') not ilike '%psa%' and coalesce(sp.title, '') not ilike '%bgs%'))
       and (wr.min_price is null or sp.current_price >= wr.min_price)
       and (wr.max_price is null or sp.current_price <= wr.max_price)
     on conflict (watchlist_id, watchlist_rule_id, source, external_id)
       where source is not null and external_id is not null
       do update set
         store_product_id = excluded.store_product_id,
         product_card_match_id = excluded.product_card_match_id,
         confidence = excluded.confidence,
         status = excluded.status,
         last_matched_at = now(),
         updated_at = now()`,
  );

  return result.rowCount ?? 0;
}
