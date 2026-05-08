export type CanonicalBackfillRule = {
  id: number;
  watchlist_id: number;
  player_id: number | null;
  brand: string | null;
  product_line: string | null;
  season: string | null;
  card_number: string | null;
  parallel: string | null;
  rookie_only: boolean;
  autograph_only: boolean;
  relic_only: boolean;
  serial_numbered_only: boolean;
  graded_only: boolean;
  raw_only: boolean;
  min_price: string | number | null;
  max_price: string | number | null;
  include_terms: string | null;
  exclude_terms: string | null;
  minimum_match_confidence: string | number | null;
};

export type BackfillSql = {
  sql: string;
  params: unknown[];
};

function terms(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\n]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function numeric(value: string | number | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addParam(params: unknown[], value: unknown): string {
  params.push(value);
  return `$${params.length}`;
}

function textSearchSql(placeholder: string): string {
  return `(
    coalesce(sp.title, '') ilike ${placeholder}
    or coalesce(sp.description, '') ilike ${placeholder}
    or coalesce(pcm.matched_player_name, '') ilike ${placeholder}
    or coalesce(pcm.match_reasons::text, '') ilike ${placeholder}
    or coalesce(pcm.matched_fields::text, '') ilike ${placeholder}
  )`;
}

function addTextMatch(conditions: string[], params: unknown[], term: string): void {
  conditions.push(textSearchSql(addParam(params, `%${term}%`)));
}

function addTextExclusion(conditions: string[], params: unknown[], term: string): void {
  conditions.push(`not ${textSearchSql(addParam(params, `%${term}%`))}`);
}

export function hasCanonicalBackfillPositiveFilter(rule: CanonicalBackfillRule): boolean {
  return Boolean(
    rule.player_id ||
      terms(rule.include_terms).length > 0 ||
      rule.brand ||
      rule.product_line ||
      rule.season ||
      rule.card_number ||
      rule.parallel ||
      rule.rookie_only ||
      rule.autograph_only ||
      rule.relic_only ||
      rule.serial_numbered_only ||
      rule.graded_only ||
      rule.raw_only,
  );
}

export function productCardMatchLateralJoinSql(): string {
  return `left join lateral (
       select *
       from public.product_card_matches pcm
       where pcm.store_product_id = sp.id
       order by pcm.confidence desc, pcm.updated_at desc
       limit 1
     ) pcm on true`;
}

export function buildCanonicalBackfillSql(rule: CanonicalBackfillRule): BackfillSql | null {
  if (!hasCanonicalBackfillPositiveFilter(rule)) return null;

  const params: unknown[] = [rule.watchlist_id, rule.id];
  const conditions = [
    "sp.is_active = true",
    "sp.current_availability = true",
  ];

  if (rule.player_id) conditions.push(`pcm.matched_player_id = ${addParam(params, rule.player_id)}`);

  for (const term of terms(rule.include_terms)) addTextMatch(conditions, params, term);
  for (const term of terms(rule.exclude_terms)) addTextExclusion(conditions, params, term);

  if (rule.brand) addTextMatch(conditions, params, rule.brand);
  if (rule.product_line) addTextMatch(conditions, params, rule.product_line);
  if (rule.season) addTextMatch(conditions, params, rule.season);
  if (rule.card_number) {
    const exact = addParam(params, rule.card_number);
    const hash = addParam(params, `%#${rule.card_number}%`);
    conditions.push(`(
      coalesce(sp.title, '') ilike ${hash}
      or coalesce(sp.description, '') ilike ${hash}
      or coalesce(sp.title, '') ~ ('(^|[^0-9])' || ${exact} || '([^0-9]|$)')
    )`);
  }
  if (rule.parallel) addTextMatch(conditions, params, rule.parallel);

  if (rule.rookie_only) conditions.push("coalesce(sp.title, '') ~* '\\m(rc|rookie)\\M'");
  if (rule.autograph_only) conditions.push("coalesce(sp.title, '') ~* '\\m(auto|autograph)\\M'");
  if (rule.relic_only) addTextMatch(conditions, params, "relic");
  if (rule.serial_numbered_only) {
    conditions.push(`(
      coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial'
      or coalesce(sp.title, '') ~ '/[0-9]+'
    )`);
  }
  if (rule.graded_only) addTextMatch(conditions, params, "graded");
  if (rule.raw_only) addTextExclusion(conditions, params, "graded");
  if (rule.min_price !== null) conditions.push(`sp.current_price >= ${addParam(params, numeric(rule.min_price, 0))}`);
  if (rule.max_price !== null) conditions.push(`sp.current_price <= ${addParam(params, numeric(rule.max_price, 0))}`);

  const minimumConfidence = numeric(rule.minimum_match_confidence, 0.75);
  const minimumConfidencePlaceholder = addParam(params, minimumConfidence);
  const confidenceSql = `greatest(coalesce(pcm.confidence, 0), ${minimumConfidencePlaceholder})`;

  return {
    params,
    sql: `insert into public.watchlist_matches (
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
       $1,
       $2,
       sp.id,
       sp.source,
       sp.external_product_id,
       pcm.id,
       ${confidenceSql}::numeric(5, 4),
       case
         when pcm.status = 'possible' or ${confidenceSql} < 0.75 then 'possible'
         else 'current'
       end,
       now(),
       now()
     from public.store_products sp
     ${productCardMatchLateralJoinSql()}
     where ${conditions.join("\n       and ")}
     on conflict (watchlist_id, watchlist_rule_id, source, external_id)
       where source is not null and external_id is not null
       do update set
         store_product_id = excluded.store_product_id,
         product_card_match_id = excluded.product_card_match_id,
         confidence = excluded.confidence,
         status = excluded.status,
         last_matched_at = now(),
         updated_at = now()`,
  };
}
