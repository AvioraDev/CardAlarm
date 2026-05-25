import "server-only";
import { query } from "./db";

export type CatalogueOption = {
  id: number;
  label: string;
};

export type CatalogueTextOptions = {
  brands: string[];
  productLines: string[];
  seasons: string[];
  cardNumbers: string[];
  parallels: string[];
};

export type WatchlistCatalogueOptions = CatalogueTextOptions & {
  players: CatalogueOption[];
  teams: CatalogueOption[];
  sets: CatalogueOption[];
  cards: CatalogueOption[];
  variants: CatalogueOption[];
};

function compactLabel(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function values(rows: Array<{ value: string | null }>): string[] {
  return rows.map((row) => row.value?.trim()).filter((value): value is string => Boolean(value));
}

export async function getWatchlistCatalogueOptions(): Promise<WatchlistCatalogueOptions> {
  const [
    players,
    teams,
    sets,
    cards,
    variants,
    brands,
    productLines,
    seasons,
    cardNumbers,
    parallels,
  ] = await Promise.all([
    query<{ id: number; full_name: string }>(
      `select id, full_name
       from public.players
       where active = true
       order by full_name
       limit 250`,
    ),
    query<{ id: number; name: string; abbreviation: string | null }>(
      `select id, name, abbreviation
       from public.teams
       order by name
       limit 100`,
    ),
    query<{ id: number; brand: string | null; product_line: string; season: string | null }>(
      `select id, brand, product_line, season
       from public.card_catalogue_sets
       order by season desc nulls last, brand nulls last, product_line
       limit 300`,
    ),
    query<{ id: number; card_number: string | null; player_name: string | null; brand: string | null; product_line: string; season: string | null }>(
      `select c.id, c.card_number, p.full_name as player_name, s.brand, s.product_line, s.season
       from public.card_catalogue_cards c
       join public.card_catalogue_sets s on s.id = c.set_id
       left join public.players p on p.id = c.player_id
       order by c.updated_at desc
       limit 300`,
    ),
    query<{ id: number; parallel_name: string | null; serial_limit: number | null; card_number: string | null; player_name: string | null; product_line: string }>(
      `select v.id, v.parallel_name, v.serial_limit, c.card_number, p.full_name as player_name, s.product_line
       from public.card_catalogue_variants v
       join public.card_catalogue_cards c on c.id = v.card_id
       join public.card_catalogue_sets s on s.id = c.set_id
       left join public.players p on p.id = c.player_id
       where nullif(trim(v.parallel_name), '') is not null
       order by v.updated_at desc
       limit 300`,
    ),
    query<{ value: string | null }>(
      `select distinct brand as value
       from public.card_catalogue_sets
       where nullif(trim(brand), '') is not null
       order by brand
       limit 200`,
    ),
    query<{ value: string | null }>(
      `select distinct product_line as value
       from public.card_catalogue_sets
       where nullif(trim(product_line), '') is not null
       order by product_line
       limit 200`,
    ),
    query<{ value: string | null }>(
      `select distinct season as value
       from public.card_catalogue_sets
       where nullif(trim(season), '') is not null
       order by season desc
       limit 100`,
    ),
    query<{ value: string | null }>(
      `select distinct card_number as value
       from public.card_catalogue_cards
       where nullif(trim(card_number), '') is not null
       order by card_number
       limit 300`,
    ),
    query<{ value: string | null }>(
      `select distinct parallel_name as value
       from public.card_catalogue_variants
       where nullif(trim(parallel_name), '') is not null
       order by parallel_name
       limit 300`,
    ),
  ]);

  return {
    players: players.map((player) => ({ id: player.id, label: player.full_name })),
    teams: teams.map((team) => ({ id: team.id, label: compactLabel([team.name, team.abbreviation ? `(${team.abbreviation})` : null]) })),
    sets: sets.map((set) => ({ id: set.id, label: compactLabel([set.season, set.brand, set.product_line]) })),
    cards: cards.map((card) => ({
      id: card.id,
      label: compactLabel([card.season, card.brand, card.product_line, card.card_number ? `#${card.card_number}` : null, card.player_name]),
    })),
    variants: variants.map((variant) => ({
      id: variant.id,
      label: compactLabel([
        variant.product_line,
        variant.card_number ? `#${variant.card_number}` : null,
        variant.player_name,
        variant.parallel_name,
        variant.serial_limit ? `/${variant.serial_limit}` : null,
      ]),
    })),
    brands: values(brands),
    productLines: values(productLines),
    seasons: values(seasons),
    cardNumbers: values(cardNumbers),
    parallels: values(parallels),
  };
}
