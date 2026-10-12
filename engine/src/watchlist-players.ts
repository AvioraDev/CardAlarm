import type { DbClient } from './db';

/**
 * Attaches a catalogue player to a free-text watchlist rule once that player exists (CAR-96).
 *
 * A watchlist made before the player was in the catalogue ("Ajay Mitchell", created 12 May; the player row appeared
 * 25 May with the checklist import) is saved as a custom rule: words only, no player. It then never matches by player
 * and never shows "Other listings". This links it, conservatively: the rule has no player, and its only non-rookie
 * include term (or, with no terms, the watchlist's name) is exactly one catalogue player's full name.
 *
 * Returns the ids of the rules that were linked. Safe to run on every reconcile.
 */
export async function linkWatchlistPlayers(db: DbClient): Promise<number[]> {
  const result = await db.query<{ id: string }>(
    `with candidate as (
       select wr.id as rule_id,
              coalesce(
                (select lower(trim(term))
                 from regexp_split_to_table(coalesce(wr.include_terms, ''), '[,\n]') term
                 where nullif(trim(term), '') is not null and trim(term) !~* '^(rookie|rookies|rc)$'),
                case when nullif(trim(coalesce(wr.include_terms, '')), '') is null then lower(trim(w.name)) end
              ) as name,
              (select count(*)
               from regexp_split_to_table(coalesce(wr.include_terms, ''), '[,\n]') term
               where nullif(trim(term), '') is not null and trim(term) !~* '^(rookie|rookies|rc)$') as term_count
       from public.watchlist_rules wr
       join public.watchlists w on w.id = wr.watchlist_id
       where wr.player_id is null
         and wr.team_id is null and wr.set_id is null and wr.catalogue_card_id is null and wr.catalogue_variant_id is null
     ),
     unique_player as (
       select c.rule_id, (array_agg(p.id))[1] as player_id
       from candidate c
       join public.players p on lower(p.full_name) = c.name or p.normalized_name = c.name
       where c.term_count <= 1 and c.name is not null
       group by c.rule_id
       having count(distinct p.id) = 1
     )
     update public.watchlist_rules wr
     set player_id = u.player_id, intent_type = 'player', updated_at = now()
     from unique_player u
     where wr.id = u.rule_id
     returning wr.id::text as id`
  );
  return result.rows.map(row => Number(row.id));
}
