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

export type WatchlistCatalogueOptionFilters = {
  playerId?: number | null;
  setId?: number | null;
  cardId?: number | null;
  season?: string | null;
  productLine?: string | null;
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

function uniqueOptions(options: CatalogueOption[]): CatalogueOption[] {
  const seen = new Set<string>();
  const unique: CatalogueOption[] = [];
  for (const option of options) {
    const key = option.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(option);
  }
  return unique;
}

function normalizedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function addParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function cardFilterSql(
  filters: WatchlistCatalogueOptionFilters,
  params: unknown[],
  aliases: { card: string; set: string } = { card: "c", set: "s" },
): string[] {
  const conditions: string[] = [];
  if (filters.playerId) conditions.push(`${aliases.card}.player_id = ${addParam(params, filters.playerId)}`);
  if (filters.setId) conditions.push(`${aliases.card}.set_id = ${addParam(params, filters.setId)}`);
  if (filters.cardId) conditions.push(`${aliases.card}.id = ${addParam(params, filters.cardId)}`);
  const season = normalizedText(filters.season);
  if (season) conditions.push(`${aliases.set}.season = ${addParam(params, season)}`);
  const productLine = normalizedText(filters.productLine);
  if (productLine) {
    conditions.push(
      `lower(regexp_replace(trim(${aliases.set}.product_line), '\\s+', ' ', 'g')) = lower(regexp_replace(trim(${addParam(params, productLine)}::text), '\\s+', ' ', 'g'))`,
    );
  }
  return conditions;
}

function hasCardFilter(filters: WatchlistCatalogueOptionFilters): boolean {
  return Boolean(filters.playerId || filters.setId || filters.cardId || normalizedText(filters.season) || normalizedText(filters.productLine));
}

async function playerOptions(): Promise<Array<{ id: number; full_name: string }>> {
  return query<{ id: number; full_name: string }>(
    `select distinct on (normalized_name) id, full_name
     from public.players
     where active = true
       and sport = 'basketball'
       and league = 'NBA'
     order by normalized_name, full_name
     limit 300`,
  );
}

async function teamOptions(): Promise<Array<{ id: number; name: string; abbreviation: string | null }>> {
  return query<{ id: number; name: string; abbreviation: string | null }>(
    `select id, name, abbreviation
     from public.teams
     where league = 'NBA'
     order by name
     limit 100`,
  );
}

async function setOptions(filters: WatchlistCatalogueOptionFilters): Promise<Array<{ id: number; brand: string | null; product_line: string; season: string | null }>> {
  const params: unknown[] = [];
  const conditions = [
    "s.sport = 'basketball'",
    "s.league = 'NBA'",
    "nullif(trim(s.product_line), '') is not null",
  ];

  if (filters.playerId) {
    conditions.push(
      `exists (
        select 1
        from public.card_catalogue_cards c
        where c.set_id = s.id
          and c.player_id = ${addParam(params, filters.playerId)}
      )`,
    );
  }
  const season = normalizedText(filters.season);
  if (season) conditions.push(`s.season = ${addParam(params, season)}`);
  const productLine = normalizedText(filters.productLine);
  if (productLine) {
    conditions.push(
      `lower(regexp_replace(trim(s.product_line), '\\s+', ' ', 'g')) = lower(regexp_replace(trim(${addParam(params, productLine)}::text), '\\s+', ' ', 'g'))`,
    );
  }

  return query<{ id: number; brand: string | null; product_line: string; season: string | null }>(
    `with grouped_sets as (
       select
         min(s.id) as id,
         min(s.brand) as brand,
         min(s.product_line) as product_line,
         min(s.season) as season
       from public.card_catalogue_sets s
       where ${conditions.join("\n         and ")}
       group by
         s.sport,
         s.league,
         coalesce(s.season, ''),
         lower(regexp_replace(trim(s.product_line), '\\s+', ' ', 'g'))
     )
     select id, brand, product_line, season
     from grouped_sets
     order by season desc nulls last, brand nulls last, product_line
     limit 300`,
    params,
  );
}

async function cardOptions(filters: WatchlistCatalogueOptionFilters): Promise<Array<{ id: number; card_number: string | null; player_name: string | null; brand: string | null; product_line: string; season: string | null }>> {
  if (!hasCardFilter(filters)) return [];

  const params: unknown[] = [];
  const conditions = [
    "s.sport = 'basketball'",
    "s.league = 'NBA'",
    ...cardFilterSql(filters, params),
  ];

  return query<{ id: number; card_number: string | null; player_name: string | null; brand: string | null; product_line: string; season: string | null }>(
    `with card_labels as (
       select
         c.id,
         c.card_number,
         p.full_name as player_name,
         s.brand,
         s.product_line,
         s.season,
         concat_ws(
           ' ',
           nullif(trim(s.season), ''),
           nullif(trim(s.brand), ''),
           nullif(trim(s.product_line), ''),
           case when nullif(trim(c.card_number), '') is null then null else '#' || trim(c.card_number) end,
           nullif(trim(p.full_name), '')
         ) as label
       from public.card_catalogue_cards c
       join public.card_catalogue_sets s on s.id = c.set_id
       left join public.players p on p.id = c.player_id
       where ${conditions.join("\n         and ")}
     ),
     labelled_cards as (
       select
         min(c.id) as id,
         min(c.card_number) as card_number,
         min(c.player_name) as player_name,
         min(c.brand) as brand,
         min(c.product_line) as product_line,
         min(c.season) as season,
         min(c.label) as label
       from card_labels c
       group by lower(c.label)
     )
     select id, card_number, player_name, brand, product_line, season
     from labelled_cards
     order by label
     limit 300`,
    params,
  );
}

async function variantOptions(filters: WatchlistCatalogueOptionFilters): Promise<Array<{ id: number; parallel_name: string | null; serial_limit: number | null; card_number: string | null; player_name: string | null; product_line: string }>> {
  const params: unknown[] = [];
  const conditions = [
    "nullif(trim(v.parallel_name), '') is not null",
    "s.sport = 'basketball'",
    "s.league = 'NBA'",
    ...cardFilterSql(filters, params),
  ];

  return query<{ id: number; parallel_name: string | null; serial_limit: number | null; card_number: string | null; player_name: string | null; product_line: string }>(
    `select v.id, v.parallel_name, v.serial_limit, c.card_number, p.full_name as player_name, s.product_line
     from public.card_catalogue_variants v
     join public.card_catalogue_cards c on c.id = v.card_id
     join public.card_catalogue_sets s on s.id = c.set_id
     left join public.players p on p.id = c.player_id
     where ${conditions.join("\n       and ")}
     order by v.updated_at desc
     limit 300`,
    params,
  );
}

async function textOptions(filters: WatchlistCatalogueOptionFilters): Promise<CatalogueTextOptions> {
  const cardNumberParams: unknown[] = [];
  const cardNumberConditions = [
    "s.sport = 'basketball'",
    "s.league = 'NBA'",
    "nullif(trim(c.card_number), '') is not null",
    ...cardFilterSql(filters, cardNumberParams),
  ];
  const [brands, productLines, seasons, cardNumbers, parallels] = await Promise.all([
    query<{ value: string | null }>(
      `select min(brand) as value
       from public.card_catalogue_sets
       where sport = 'basketball'
         and league = 'NBA'
         and nullif(trim(brand), '') is not null
       group by lower(regexp_replace(trim(brand), '\\s+', ' ', 'g'))
       order by value
       limit 200`,
    ),
    query<{ value: string | null }>(
      `select min(product_line) as value
       from public.card_catalogue_sets
       where sport = 'basketball'
         and league = 'NBA'
         and nullif(trim(product_line), '') is not null
       group by lower(regexp_replace(trim(product_line), '\\s+', ' ', 'g'))
       order by value
       limit 200`,
    ),
    query<{ value: string | null }>(
      `select min(season) as value
       from public.card_catalogue_sets
       where sport = 'basketball'
         and league = 'NBA'
         and nullif(trim(season), '') is not null
       group by lower(regexp_replace(trim(season), '\\s+', ' ', 'g'))
       order by value desc
       limit 100`,
    ),
    hasCardFilter(filters)
      ? query<{ value: string | null }>(
          `select min(c.card_number) as value
           from public.card_catalogue_cards c
           join public.card_catalogue_sets s on s.id = c.set_id
           where ${cardNumberConditions.join("\n             and ")}
           group by lower(regexp_replace(trim(c.card_number), '\\s+', ' ', 'g'))
           order by value
           limit 300`,
          cardNumberParams,
        )
      : Promise.resolve([]),
    query<{ value: string | null }>(
      `select min(v.parallel_name) as value
       from public.card_catalogue_variants v
       join public.card_catalogue_cards c on c.id = v.card_id
       join public.card_catalogue_sets s on s.id = c.set_id
       where s.sport = 'basketball'
         and s.league = 'NBA'
         and nullif(trim(v.parallel_name), '') is not null
       group by lower(regexp_replace(trim(v.parallel_name), '\\s+', ' ', 'g'))
       order by value
       limit 300`,
    ),
  ]);

  return {
    brands: values(brands),
    productLines: values(productLines),
    seasons: values(seasons),
    cardNumbers: values(cardNumbers),
    parallels: values(parallels),
  };
}

export async function getWatchlistCatalogueOptions(
  filters: WatchlistCatalogueOptionFilters = {},
): Promise<WatchlistCatalogueOptions> {
  const [players, teams, sets, cards, variants, text] = await Promise.all([
    playerOptions(),
    teamOptions(),
    setOptions(filters),
    cardOptions(filters),
    variantOptions(filters),
    textOptions(filters),
  ]);

  return {
    players: uniqueOptions(players.map((player) => ({ id: player.id, label: player.full_name }))),
    teams: uniqueOptions(teams.map((team) => ({ id: team.id, label: compactLabel([team.name, team.abbreviation ? `(${team.abbreviation})` : null]) }))),
    sets: uniqueOptions(sets.map((set) => ({ id: set.id, label: compactLabel([set.season, set.brand, set.product_line]) }))),
    cards: uniqueOptions(cards.map((card) => ({
      id: card.id,
      label: compactLabel([card.season, card.brand, card.product_line, card.card_number ? `#${card.card_number}` : null, card.player_name]),
    }))),
    variants: uniqueOptions(variants.map((variant) => ({
      id: variant.id,
      label: compactLabel([
        variant.product_line,
        variant.card_number ? `#${variant.card_number}` : null,
        variant.player_name,
        variant.parallel_name,
        variant.serial_limit ? `/${variant.serial_limit}` : null,
      ]),
    }))),
    ...text,
  };
}
