import { query } from "./db";
import type {
  ListingRow,
  WatchlistRow,
  FeedStats,
  WatchlistDashboardStats,
  FilterOptions,
  FilterFacets,
  FacetItem,
  ScanRunRow,
} from "./types";

const ACTIVE_WHERE = "is_dismissed = false AND is_oos = false";

function buildFilterClause(filters: FilterOptions): {
  conditions: string[];
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const addParam = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.year) conditions.push(`year = ${addParam(filters.year)}`);
  if (filters.setName) conditions.push(`set_name = ${addParam(filters.setName)}`);
  if (filters.player) conditions.push(`player_name = ${addParam(filters.player)}`);
  if (filters.variant) conditions.push(`variant = ${addParam(filters.variant)}`);
  if (filters.matchType) conditions.push(`match_type = ${addParam(filters.matchType)}`);
  if (filters.category) conditions.push(`category = ${addParam(filters.category)}`);
  if (filters.isSerial === "1") conditions.push("is_serial = true");
  else if (filters.isSerial === "0") conditions.push("is_serial = false");
  if (filters.isAuto === "1") conditions.push("is_auto = true");
  else if (filters.isAuto === "0") conditions.push("is_auto = false");
  if (filters.isRookie === "1") conditions.push("is_rookie = true");
  else if (filters.isRookie === "0") conditions.push("is_rookie = false");
  if (filters.watchlistOnly === "1") {
    conditions.push("player_name IN (SELECT player_name FROM watchlist WHERE is_active = true)");
  } else if (filters.watchlistOnly === "0") {
    conditions.push("player_name NOT IN (SELECT player_name FROM watchlist WHERE is_active = true)");
  }
  if (filters.priceMin) {
    const min = Number.parseFloat(filters.priceMin);
    if (!Number.isNaN(min)) conditions.push(`price >= ${addParam(min)}`);
  }
  if (filters.priceMax) {
    const max = Number.parseFloat(filters.priceMax);
    if (!Number.isNaN(max)) conditions.push(`price <= ${addParam(max)}`);
  }
  if (filters.search) conditions.push(`title ILIKE ${addParam(`%${filters.search}%`)}`);

  return { conditions, params };
}

function listingSelectSql(prefix = ""): string {
  return `id,
       external_id,
       source,
       title,
       price::float8 as price,
       url,
       image_url,
       match_type,
       is_dismissed,
       is_oos,
       created_at,
       year,
       set_name,
       card_number,
       player_name,
       variant,
       is_serial,
       serial_number,
       serial_current,
       serial_limit,
       is_auto,
       is_rookie,
       category,
       match_confidence::float8 as match_confidence,
       match_status,
       match_reasons,
       unmatched_fields,
       matcher_version`
    .split("\n")
    .map((line) => (line.trim().length === 0 ? line : `${prefix}${line}`))
    .join("\n");
}

function watchlistListingSelectSql(): string {
  return `lf.id,
       lf.external_id,
       lf.source,
       lf.title,
       lf.price::float8 as price,
       lf.url,
       lf.image_url,
       lf.match_type,
       lf.is_dismissed,
       lf.is_oos,
       lf.created_at,
       lf.year,
       lf.set_name,
       lf.card_number,
       lf.player_name,
       lf.variant,
       lf.is_serial,
       lf.serial_number,
       lf.serial_current,
       lf.serial_limit,
       lf.is_auto,
       lf.is_rookie,
       lf.category,
       greatest(coalesce(wm.confidence, 0), coalesce(lf.match_confidence, 0))::float8 as match_confidence,
       case when wm.status = 'possible' then 'possible' else coalesce(lf.match_status, 'confirmed') end as match_status,
       lf.match_reasons,
       lf.unmatched_fields,
       lf.matcher_version`;
}

export async function getActiveFeed(filters: FilterOptions = {}): Promise<ListingRow[]> {
  const { conditions, params } = buildFilterClause(filters);
  const allConditions = [ACTIVE_WHERE, ...conditions].join(" AND ");
  return query<ListingRow>(
    `SELECT
       ${listingSelectSql()}
     FROM listings_feed
     WHERE ${allConditions}
     ORDER BY created_at DESC`,
    params,
  );
}

export async function getUserWatchlistFeed(userId: string): Promise<ListingRow[]> {
  return query<ListingRow>(
    `select distinct on (lf.source, lf.external_id)
       ${watchlistListingSelectSql()}
     from public.watchlist_matches wm
     join public.watchlists w on w.id = wm.watchlist_id
     join public.listings_feed lf on lf.source = wm.source and lf.external_id = wm.external_id
     where w.user_id = $1
       and w.is_active = true
       and lf.is_dismissed = false
       and lf.is_oos = false
     order by lf.source, lf.external_id, wm.confidence desc, wm.last_matched_at desc`,
    [userId],
  );
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const rows = await query<{ c: string | number }>(sql, params);
  return Number(rows[0]?.c ?? 0);
}

export async function getFeedStats(filters: FilterOptions = {}): Promise<FeedStats> {
  const { conditions, params } = buildFilterClause(filters);
  const allConditions = [ACTIVE_WHERE, ...conditions].join(" AND ");

  const [total, direct, stealth, confirmed, possible, serialized] = await Promise.all([
    count(`SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions}`, params),
    count(`SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND match_type = 'Direct'`, params),
    count(`SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND match_type = 'Stealth'`, params),
    count(`SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND COALESCE(match_status, 'confirmed') = 'confirmed'`, params),
    count(`SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND match_status = 'possible'`, params),
    count(`SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND is_serial = true`, params),
  ]);

  return { total, direct, stealth, confirmed, possible, serialized };
}

export async function getUserWatchlistStats(userId: string): Promise<WatchlistDashboardStats> {
  const [total, current, possible, watchlists, serialized] = await Promise.all([
    count(
      `select count(distinct (lf.source, lf.external_id)) as c
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       join public.listings_feed lf on lf.source = wm.source and lf.external_id = wm.external_id
       where w.user_id = $1 and w.is_active = true and lf.is_dismissed = false and lf.is_oos = false`,
      [userId],
    ),
    count(
      `select count(distinct (lf.source, lf.external_id)) as c
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       join public.listings_feed lf on lf.source = wm.source and lf.external_id = wm.external_id
       where w.user_id = $1 and w.is_active = true and wm.status != 'possible' and lf.is_dismissed = false and lf.is_oos = false`,
      [userId],
    ),
    count(
      `select count(distinct (lf.source, lf.external_id)) as c
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       join public.listings_feed lf on lf.source = wm.source and lf.external_id = wm.external_id
       where w.user_id = $1 and w.is_active = true and wm.status = 'possible' and lf.is_dismissed = false and lf.is_oos = false`,
      [userId],
    ),
    count("select count(*) as c from public.watchlists where user_id = $1 and is_active = true", [userId]),
    count(
      `select count(distinct (lf.source, lf.external_id)) as c
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       join public.listings_feed lf on lf.source = wm.source and lf.external_id = wm.external_id
       where w.user_id = $1 and w.is_active = true and lf.is_serial = true and lf.is_dismissed = false and lf.is_oos = false`,
      [userId],
    ),
  ]);

  return { total, current, possible, watchlists, serialized };
}

export async function getFilterFacets(filters: FilterOptions = {}): Promise<FilterFacets> {
  const { conditions, params } = buildFilterClause(filters);
  const baseWhere = [ACTIVE_WHERE, ...conditions].join(" AND ");

  async function getFacet(column: string): Promise<FacetItem[]> {
    return query<FacetItem>(
      `SELECT ${column} as value, COUNT(*)::int as count
       FROM listings_feed
       WHERE ${baseWhere} AND ${column} IS NOT NULL AND ${column} != ''
       GROUP BY ${column}
       ORDER BY count DESC`,
      params
    );
  }

  const [years, setNames, players, variants, categories] = await Promise.all([
    getFacet("year"),
    getFacet("set_name"),
    getFacet("player_name"),
    getFacet("variant"),
    getFacet("category"),
  ]);

  return { years, setNames, players, variants, categories };
}

export async function getWatchlist(): Promise<WatchlistRow[]> {
  return query<WatchlistRow>(`SELECT * FROM watchlist ORDER BY is_active DESC, player_name ASC`);
}

export async function getLatestScanRun(): Promise<ScanRunRow | null> {
  const rows = await query<ScanRunRow>(`SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1`);
  return rows[0] ?? null;
}

export async function getRecentScanRuns(limit = 10): Promise<ScanRunRow[]> {
  return query<ScanRunRow>(
    `select *
     from scan_runs
     order by started_at desc
     limit $1`,
    [limit],
  );
}
