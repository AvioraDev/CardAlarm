-- A watchlist's name is a label, never a search term (acceptance test, step 9).
--
-- Creating a watchlist copied its name into the rule's include_terms, so every listing title had to contain the
-- name as well as match the player or set the user picked. "test" (a set) found nothing; "My Ant cards" (a player)
-- found nothing. Clear the copied name where the rule already says what it is looking for in a catalogue
-- player, team, set, card or variant. Words-only rules (no catalogue pick) keep their terms: for them the terms
-- are the search.

update public.watchlist_rules wr
set include_terms = null, updated_at = now()
from public.watchlists w
where w.id = wr.watchlist_id
  and nullif(trim(wr.include_terms), '') is not null
  and lower(trim(wr.include_terms)) = lower(trim(w.name))
  and (wr.player_id is not null or wr.team_id is not null or wr.set_id is not null
       or wr.catalogue_card_id is not null or wr.catalogue_variant_id is not null);
