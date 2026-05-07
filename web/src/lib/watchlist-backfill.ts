import "server-only";
import type { PoolClient } from "pg";
import { transaction } from "./db";

type BackfillRule = {
  id: number;
  watchlist_id: number;
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

type BackfillResult = {
  watchlistId: number;
  rulesProcessed: number;
  matchesCreatedOrUpdated: number;
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

function addTextMatch(conditions: string[], params: unknown[], term: string): void {
  const placeholder = addParam(params, `%${term}%`);
  conditions.push(`(
    lf.title ilike ${placeholder}
    or coalesce(lf.player_name, '') ilike ${placeholder}
    or coalesce(lf.set_name, '') ilike ${placeholder}
    or coalesce(lf.variant, '') ilike ${placeholder}
    or coalesce(sp.title, '') ilike ${placeholder}
    or coalesce(sp.description, '') ilike ${placeholder}
  )`);
}

function addTextExclusion(conditions: string[], params: unknown[], term: string): void {
  const placeholder = addParam(params, `%${term}%`);
  conditions.push(`not (
    lf.title ilike ${placeholder}
    or coalesce(lf.player_name, '') ilike ${placeholder}
    or coalesce(lf.set_name, '') ilike ${placeholder}
    or coalesce(lf.variant, '') ilike ${placeholder}
    or coalesce(sp.title, '') ilike ${placeholder}
    or coalesce(sp.description, '') ilike ${placeholder}
  )`);
}

async function rulesForWatchlist(client: PoolClient, userId: string, watchlistId: number): Promise<BackfillRule[]> {
  const result = await client.query<BackfillRule>(
    `select wr.*
     from public.watchlist_rules wr
     join public.watchlists w on w.id = wr.watchlist_id
     where w.id = $1
       and w.user_id = $2
       and w.is_active = true
     order by wr.created_at asc`,
    [watchlistId, userId],
  );

  return result.rows;
}

async function backfillRule(client: PoolClient, rule: BackfillRule): Promise<number> {
  const params: unknown[] = [rule.watchlist_id, rule.id];
  const includeTerms = terms(rule.include_terms);
  const excludeTerms = terms(rule.exclude_terms);
  const hasPositiveFilter = Boolean(
    includeTerms.length > 0 ||
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

  if (!hasPositiveFilter) return 0;

  const conditions = [
    "lf.is_dismissed = false",
    "lf.is_oos = false",
    "coalesce(sp.current_availability, true) = true",
  ];

  for (const term of includeTerms) addTextMatch(conditions, params, term);
  for (const term of excludeTerms) addTextExclusion(conditions, params, term);

  if (rule.brand) addTextMatch(conditions, params, rule.brand);
  if (rule.product_line) addTextMatch(conditions, params, rule.product_line);
  if (rule.season) conditions.push(`coalesce(lf.year, '') = ${addParam(params, rule.season)}`);
  if (rule.card_number) conditions.push(`coalesce(lf.card_number, '') = ${addParam(params, rule.card_number)}`);
  if (rule.parallel) {
    const placeholder = addParam(params, `%${rule.parallel}%`);
    conditions.push(`(coalesce(lf.variant, '') ilike ${placeholder} or lf.title ilike ${placeholder})`);
  }
  if (rule.rookie_only) conditions.push("lf.is_rookie = true");
  if (rule.autograph_only) conditions.push("lf.is_auto = true");
  if (rule.serial_numbered_only) conditions.push("lf.is_serial = true");
  if (rule.min_price !== null) conditions.push(`lf.price >= ${addParam(params, numeric(rule.min_price, 0))}`);
  if (rule.max_price !== null) conditions.push(`lf.price <= ${addParam(params, numeric(rule.max_price, 0))}`);

  if (rule.relic_only) addTextMatch(conditions, params, "relic");
  if (rule.graded_only) addTextMatch(conditions, params, "graded");
  if (rule.raw_only) addTextExclusion(conditions, params, "graded");

  const minimumConfidence = numeric(rule.minimum_match_confidence, 0.75);
  params.push(minimumConfidence);
  const minimumConfidencePlaceholder = `$${params.length}`;

  const result = await client.query(
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
       $1,
       $2,
       sp.id,
       lf.source,
       lf.external_id,
       pcm.id,
       greatest(coalesce(pcm.confidence, 0), coalesce(lf.match_confidence, 0), ${minimumConfidencePlaceholder})::numeric(5, 4),
       case
         when greatest(coalesce(pcm.confidence, 0), coalesce(lf.match_confidence, 0), ${minimumConfidencePlaceholder}) >= 0.75
           then 'current'
         else 'possible'
       end,
       now(),
       now()
     from public.listings_feed lf
     left join public.store_products sp
       on sp.source = lf.source
      and sp.external_product_id = lf.external_id
     left join public.product_card_matches pcm
       on pcm.source = lf.source
      and pcm.external_id = lf.external_id
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
    params,
  );

  return result.rowCount ?? 0;
}

export async function backfillWatchlist(userId: string, watchlistId: number): Promise<BackfillResult> {
  return transaction(async (client) => {
    const rules = await rulesForWatchlist(client, userId, watchlistId);
    await client.query(
      `delete from public.watchlist_matches wm
       using public.watchlists w
       where wm.watchlist_id = w.id
         and w.id = $1
         and w.user_id = $2`,
      [watchlistId, userId],
    );

    let matchesCreatedOrUpdated = 0;
    for (const rule of rules) {
      matchesCreatedOrUpdated += await backfillRule(client, rule);
    }

    return {
      watchlistId,
      rulesProcessed: rules.length,
      matchesCreatedOrUpdated,
    };
  });
}
