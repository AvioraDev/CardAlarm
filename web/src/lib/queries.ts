import { query } from "./db";
import type {
  ListingRow,
  FeedStats,
  WatchlistDashboardStats,
  FilterOptions,
  FilterFacets,
  FacetItem,
  ScanRunRow,
  StoreScanRunRow,
  StoreRow,
  WatchlistChipRow,
} from "./types";
import {
  buildInventoryWhereSql,
  buildWatchlistMatchWhereSql,
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

export async function getUserWatchlistFeed(userId: string, filters: FilterOptions = {}): Promise<ListingRow[]> {
  const { whereSql, params } = buildWatchlistMatchWhereSql(userId, filters);
  return query<ListingRow>(
    `select *
     from (
       select distinct on (sp.id)
         ${watchlistInventoryListingSelectSql()}
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       left join public.watchlist_rules wr on wr.id = wm.watchlist_rule_id
       left join public.players p on p.id = wr.player_id
       join public.store_products sp on sp.id = wm.store_product_id
       ${watchlistInventoryMatchJoinSql()}
       where ${whereSql}
       order by sp.id, greatest(coalesce(wm.confidence, 0), coalesce(pcm.confidence, 0)) desc, wm.last_matched_at desc
     ) ranked_matches
     order by match_confidence desc nulls last, created_at desc`,
    params,
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

export async function getUserWatchlistStats(userId: string, filters: FilterOptions = {}): Promise<WatchlistDashboardStats> {
  const { whereSql, params } = buildWatchlistMatchWhereSql(userId, filters);
  const watchlistInventoryFromSql = `
       from public.watchlist_matches wm
       join public.watchlists w on w.id = wm.watchlist_id
       left join public.watchlist_rules wr on wr.id = wm.watchlist_rule_id
       left join public.players p on p.id = wr.player_id
       join public.store_products sp on sp.id = wm.store_product_id
       ${watchlistInventoryMatchJoinSql()}
       where ${whereSql}`;
  const [total, current, possible, watchlists, serialized] = await Promise.all([
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}`,
      params,
    ),
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}
         and coalesce(wm.status, pcm.status, 'confirmed') != 'possible'`,
      params,
    ),
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}
         and (wm.status = 'possible' or pcm.status = 'possible')`,
      params,
    ),
    count("select count(*) as c from public.watchlists where user_id = $1 and is_active = true", [userId]),
    count(
      `select count(distinct sp.id) as c
       ${watchlistInventoryFromSql}
         and (coalesce(pcm.matched_fields, '[]'::jsonb) ? 'serial')`,
      params,
    ),
  ]);

  return { total, current, possible, watchlists, serialized };
}

export async function getActiveUserWatchlistChips(userId: string): Promise<WatchlistChipRow[]> {
  return query<WatchlistChipRow>(
    `select
       w.id,
       w.name,
       count(distinct sp.id)::int as match_count
     from public.watchlists w
     left join public.watchlist_matches wm on wm.watchlist_id = w.id
     left join public.store_products sp
       on sp.id = wm.store_product_id
      and sp.is_active = true
      and sp.current_availability = true
     where w.user_id = $1
       and w.is_active = true
     group by w.id, w.name
     order by w.updated_at desc, w.name asc`,
    [userId],
  );
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

export async function getStores(): Promise<StoreRow[]> {
  return query<StoreRow>(
    `select *
     from public.stores
     order by is_active desc, name asc`,
  );
}

export async function getStoreById(id: number): Promise<StoreRow | null> {
  const rows = await query<StoreRow>(
    `select *
     from public.stores
     where id = $1
     limit 1`,
    [id],
  );
  return rows[0] ?? null;
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

export async function getRecentStoreScanRuns(limit = 24): Promise<StoreScanRunRow[]> {
  return query<StoreScanRunRow>(
    `select
       ssr.id,
       ssr.store_id,
       ssr.store_slug,
       s.name as store_name,
       ssr.status,
       ssr.started_at,
       ssr.completed_at,
       ssr.products_seen,
       coalesce(ssr.products_processed, 0) as products_processed,
       coalesce(ssr.products_matched, 0) as products_matched,
       ssr.products_marked_unavailable,
       ssr.metadata->>'scanStrategy' as scan_strategy,
       coalesce((ssr.metadata->>'earlyStopEnabled')::boolean, false) as early_stop_enabled,
       (ssr.metadata->>'earlyStopUnchangedPages')::integer as early_stop_unchanged_pages,
       coalesce((ssr.metadata->>'stoppedEarly')::boolean, false) as stopped_early,
       coalesce((ssr.metadata->>'pagesFetched')::integer, 0) as pages_fetched,
       ssr.error_message
     from public.store_scan_runs ssr
     left join public.stores s on s.id = ssr.store_id
     order by ssr.started_at desc
     limit $1`,
    [limit],
  );
}
