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
import { buildInventoryWhereSql, inventoryListingSelectSql, inventoryMatchJoinSql } from "./inventory-sql";

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
  const { whereSql, params } = buildInventoryWhereSql(filters);
  return query<ListingRow>(
    `SELECT
       ${inventoryListingSelectSql()}
     FROM public.store_products sp
     ${inventoryMatchJoinSql()}
     WHERE ${whereSql}
     ORDER BY sp.last_checked_at DESC NULLS LAST, sp.last_seen_at DESC, sp.created_at DESC`,
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
  const { whereSql, params } = buildInventoryWhereSql(filters);
  const fromSql = `FROM public.store_products sp ${inventoryMatchJoinSql()} WHERE ${whereSql}`;

  const [total, direct, stealth, confirmed, possible, serialized] = await Promise.all([
    count(`SELECT COUNT(*) as c ${fromSql}`, params),
    count(`SELECT COUNT(*) as c ${fromSql} AND pcm.id IS NOT NULL`, params),
    count(`SELECT COUNT(*) as c ${fromSql} AND pcm.id IS NULL`, params),
    count(`SELECT COUNT(*) as c ${fromSql} AND pcm.id IS NOT NULL AND COALESCE(pcm.status, 'confirmed') != 'possible'`, params),
    count(`SELECT COUNT(*) as c ${fromSql} AND pcm.status = 'possible'`, params),
    count(`SELECT COUNT(*) as c ${fromSql} AND (coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial')`, params),
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
  const { whereSql, params } = buildInventoryWhereSql(filters);

  async function getFacet(expression: string): Promise<FacetItem[]> {
    return query<FacetItem>(
      `SELECT ${expression} as value, COUNT(*)::int as count
       FROM public.store_products sp
       ${inventoryMatchJoinSql()}
       WHERE ${whereSql} AND ${expression} IS NOT NULL AND ${expression} != ''
       GROUP BY ${expression}
       ORDER BY count DESC`,
      params
    );
  }

  const [sources, players] = await Promise.all([
    getFacet("sp.source"),
    getFacet("pcm.matched_player_name"),
  ]);

  return { sources, years: [], setNames: [], players, variants: [], categories: [] };
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
