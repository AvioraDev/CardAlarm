create unique index if not exists idx_players_sport_league_normalized_name
  on public.players (sport, league, normalized_name);

create unique index if not exists idx_card_catalogue_sets_sport_league_season_product_line
  on public.card_catalogue_sets (
    sport,
    league,
    coalesce(season, ''),
    lower(regexp_replace(trim(product_line), '\s+', ' ', 'g'))
  )
  where nullif(trim(product_line), '') is not null;

create unique index if not exists idx_card_catalogue_cards_set_player_card_number
  on public.card_catalogue_cards (
    set_id,
    player_id,
    lower(regexp_replace(trim(card_number), '\s+', ' ', 'g'))
  )
  where player_id is not null
    and nullif(trim(card_number), '') is not null;

insert into public.players (
  full_name,
  normalized_name,
  sport,
  league,
  active
)
select distinct
  min(normalized.full_name) as full_name,
  normalized.normalized_name,
  'basketball',
  'NBA',
  true
from (
  select
    regexp_replace(trim(player_name), '\s+', ' ', 'g') as full_name,
    lower(regexp_replace(trim(player_name), '\s+', ' ', 'g')) as normalized_name
  from public.reference_checklists
  where nullif(trim(player_name), '') is not null
) normalized
group by normalized.normalized_name
on conflict (normalized_name) do update set
  full_name = excluded.full_name,
  sport = coalesce(public.players.sport, excluded.sport),
  league = coalesce(public.players.league, excluded.league),
  active = true;

with parsed_sets as (
  select distinct
    case
      when trim(set_name) ~ '^((19|20)[0-9]{2}-[0-9]{2})(\s+|$)'
        then substring(trim(set_name) from '^((?:19|20)[0-9]{2}-[0-9]{2})')
      else null
    end as season,
    case
      when trim(set_name) ~ '^((19|20)[0-9]{2}-[0-9]{2})(\s+|$)'
        then nullif(regexp_replace(trim(set_name), '^((?:19|20)[0-9]{2}-[0-9]{2})\s*[-:]?\s*', ''), '')
      else regexp_replace(trim(set_name), '\s+', ' ', 'g')
    end as product_line
  from public.reference_checklists
  where nullif(trim(set_name), '') is not null
),
normalized_sets as (
  select
    nullif(trim(season), '') as season,
    regexp_replace(trim(product_line), '\s+', ' ', 'g') as product_line
  from parsed_sets
  where nullif(trim(product_line), '') is not null
)
insert into public.card_catalogue_sets (
  brand,
  product_line,
  season,
  sport,
  league,
  source,
  verification_status
)
select
  null,
  ns.product_line,
  ns.season,
  'basketball',
  'NBA',
  'reference_checklists',
  'imported'
from normalized_sets ns
where not exists (
  select 1
  from public.card_catalogue_sets existing
  where existing.sport = 'basketball'
    and existing.league = 'NBA'
    and existing.season is not distinct from ns.season
    and lower(regexp_replace(trim(existing.product_line), '\s+', ' ', 'g')) = lower(ns.product_line)
);

drop table if exists pg_temp.cardalarm_reference_cards;
create temp table cardalarm_reference_cards on commit drop as
select distinct
    lower(regexp_replace(trim(rc.player_name), '\s+', ' ', 'g')) as normalized_player_name,
    regexp_replace(trim(rc.card_number), '\s+', ' ', 'g') as card_number,
    case
      when trim(rc.set_name) ~ '^((19|20)[0-9]{2}-[0-9]{2})(\s+|$)'
        then substring(trim(rc.set_name) from '^((?:19|20)[0-9]{2}-[0-9]{2})')
      else null
    end as season,
    case
      when trim(rc.set_name) ~ '^((19|20)[0-9]{2}-[0-9]{2})(\s+|$)'
        then nullif(regexp_replace(trim(rc.set_name), '^((?:19|20)[0-9]{2}-[0-9]{2})\s*[-:]?\s*', ''), '')
      else regexp_replace(trim(rc.set_name), '\s+', ' ', 'g')
    end as product_line
from public.reference_checklists rc
where nullif(trim(rc.set_name), '') is not null
  and nullif(trim(rc.player_name), '') is not null
  and nullif(trim(rc.card_number), '') is not null;

create index cardalarm_reference_cards_set_key
  on cardalarm_reference_cards (
    coalesce(season, ''),
    lower(regexp_replace(trim(product_line), '\s+', ' ', 'g'))
  );

create index cardalarm_reference_cards_player_key
  on cardalarm_reference_cards (normalized_player_name);

drop table if exists pg_temp.cardalarm_catalogue_sets;
create temp table cardalarm_catalogue_sets on commit drop as
select
  id,
  coalesce(season, '') as season_key,
  lower(regexp_replace(trim(product_line), '\s+', ' ', 'g')) as product_line_key
from public.card_catalogue_sets
where sport = 'basketball'
  and league = 'NBA'
  and nullif(trim(product_line), '') is not null;

create index cardalarm_catalogue_sets_key
  on cardalarm_catalogue_sets (season_key, product_line_key);

insert into public.card_catalogue_cards (
  set_id,
  player_id,
  card_number,
  is_rookie,
  is_insert,
  is_autograph,
  is_relic,
  verification_status
)
select
  resolved.set_id,
  resolved.player_id,
  resolved.card_number,
  false,
  false,
  false,
  false,
  'imported'
from (
  select distinct
    sets.id as set_id,
    players.id as player_id,
    reference.card_number
  from cardalarm_reference_cards reference
  join cardalarm_catalogue_sets sets
    on sets.season_key = coalesce(reference.season, '')
   and sets.product_line_key = lower(regexp_replace(trim(reference.product_line), '\s+', ' ', 'g'))
  join public.players players
    on players.sport = 'basketball'
   and players.league = 'NBA'
   and players.normalized_name = reference.normalized_player_name
) resolved
on conflict do nothing;
