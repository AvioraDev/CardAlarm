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
import {
  buildInventoryWhereSql,
  inventoryListingSelectSql,
  inventoryMatchJoinSql,
  watchlistInventoryListingSelectSql,
  watchlistInventoryMatchJoinSql,
} from "./inventory-sql";

export async function getActiveFeed(
  filters: FilterOptions = {},
  pagination: { limit?: number; offset?: number } = {},
): Promise<ListingRow[]> {
  const { whereSql, params } = buildInventoryWhereSql(filters);
  const limit = Math.min(Math.max(pagination.limit ?? 48, 1), 96);
  const offset = Math.max(pagination.offset ?? 0, 0);
  return query<ListingRow>(
    `SELECT
       ${inventoryListingSelectSql()}
     FROM public.store_products sp
     ${inventoryMatchJoinSql()}
     WHERE ${whereSql}
     ORDER BY sp.last_checked_at DESC NULLS LAST, sp.last_seen_at DESC, sp.created_at DESC
     LIMIT $${params.length + 1}
     OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
}

export async function getUserWatchlistFeed(userId: string): Promise<ListingRow[]> {
  return query<ListingRow>(
    `select distinct on (sp.id)
       ${watchlistInventoryListingSelectSql()}
     from public.watchlist_matches wm
     join public.watchlists w on w.id = wm.watchlist_id
     join public.store_products sp on sp.id = wm.store_product_id
     ${watchlistInventoryMatchJoinSql()}
     where w.user_id = $1
       and w.is_active = true
       and sp.is_active = true
       and sp.current_availability = true
     order by sp.id, wm.confidence desc, wm.last_matched_at desc`,
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
  const watchlistInventoryFromSql = `
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       join public.store_products sp on sp.id = wm.store_product_id
       ${watchlistInventoryMatchJoinSql()}
       where w.user_id = $1
         and w.is_active = true
         and sp.is_active = true
         and sp.current_availability = true`;
  const [total, current, possible, watchlists, serialized] = await Promise.all([
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}`,
      [userId],
    ),
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}
         and wm.status != 'possible'`,
      [userId],
    ),
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}
         and wm.status = 'possible'`,
      [userId],
    ),
    count("select count(*) as c from public.watchlists where user_id = $1 and is_active = true", [userId]),
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}
         and (coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial')`,
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
