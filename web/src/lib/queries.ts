import { getDb } from "./db";
import type {
  ListingRow,
  WatchlistRow,
  FeedStats,
  FilterOptions,
  FilterFacets,
  FacetItem,
  ScanRunRow,
} from "./types";

// ─── Base WHERE clause for active (non-dismissed, in-stock) listings ─
const ACTIVE_WHERE = "is_dismissed = 0 AND is_oos = 0";

/**
 * Build dynamic WHERE conditions from filter options.
 * Returns { clause: string, params: unknown[] } to append to the base query.
 */
function buildFilterClause(filters: FilterOptions): {
  conditions: string[];
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.year) {
    conditions.push("year = ?");
    params.push(filters.year);
  }
  if (filters.setName) {
    conditions.push("set_name = ?");
    params.push(filters.setName);
  }
  if (filters.player) {
    conditions.push("player_name = ?");
    params.push(filters.player);
  }
  if (filters.variant) {
    conditions.push("variant = ?");
    params.push(filters.variant);
  }
  if (filters.matchType) {
    conditions.push("match_type = ?");
    params.push(filters.matchType);
  }
  if (filters.category) {
    conditions.push("category = ?");
    params.push(filters.category);
  }
  if (filters.isSerial === "1") {
    conditions.push("is_serial = 1");
  } else if (filters.isSerial === "0") {
    conditions.push("is_serial = 0");
  }
  if (filters.isAuto === "1") {
    conditions.push("is_auto = 1");
  } else if (filters.isAuto === "0") {
    conditions.push("is_auto = 0");
  }
  if (filters.isRookie === "1") {
    conditions.push("is_rookie = 1");
  } else if (filters.isRookie === "0") {
    conditions.push("is_rookie = 0");
  }
  if (filters.watchlistOnly === "1") {
    conditions.push("player_name IN (SELECT player_name FROM watchlist WHERE is_active = 1)");
  } else if (filters.watchlistOnly === "0") {
    conditions.push("player_name NOT IN (SELECT player_name FROM watchlist WHERE is_active = 1)");
  }
  if (filters.priceMin) {
    const min = parseFloat(filters.priceMin);
    if (!isNaN(min)) {
      conditions.push("price >= ?");
      params.push(min);
    }
  }
  if (filters.priceMax) {
    const max = parseFloat(filters.priceMax);
    if (!isNaN(max)) {
      conditions.push("price <= ?");
      params.push(max);
    }
  }
  if (filters.search) {
    conditions.push("title LIKE ?");
    params.push(`%${filters.search}%`);
  }

  return { conditions, params };
}

/**
 * Active feed with optional filters. Non-dismissed, in-stock listings
 * filtered by any combination of metadata facets.
 */
export function getActiveFeed(filters: FilterOptions = {}): ListingRow[] {
  const db = getDb();
  const { conditions, params } = buildFilterClause(filters);

  const allConditions = [ACTIVE_WHERE, ...conditions].join(" AND ");
  const sql = `SELECT * FROM listings_feed WHERE ${allConditions} ORDER BY created_at DESC`;

  return db.prepare(sql).all(...params) as ListingRow[];
}

/**
 * Aggregate counts for the stats bar, respecting active filters.
 */
export function getFeedStats(filters: FilterOptions = {}): FeedStats {
  const db = getDb();
  const { conditions, params } = buildFilterClause(filters);
  const allConditions = [ACTIVE_WHERE, ...conditions].join(" AND ");

  const total = db
    .prepare(`SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions}`)
    .get(...params) as { c: number };

  const direct = db
    .prepare(
      `SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND match_type = 'Direct'`
    )
    .get(...params) as { c: number };

  const stealth = db
    .prepare(
      `SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND match_type = 'Stealth'`
    )
    .get(...params) as { c: number };

  const confirmed = db
    .prepare(
      `SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND COALESCE(match_status, 'confirmed') = 'confirmed'`
    )
    .get(...params) as { c: number };

  const possible = db
    .prepare(
      `SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND match_status = 'possible'`
    )
    .get(...params) as { c: number };

  const serialized = db
    .prepare(
      `SELECT COUNT(*) as c FROM listings_feed WHERE ${allConditions} AND is_serial = 1`
    )
    .get(...params) as { c: number };

  return {
    total: total.c,
    direct: direct.c,
    stealth: stealth.c,
    confirmed: confirmed.c,
    possible: possible.c,
    serialized: serialized.c,
  };
}

/**
 * Get distinct values + counts for each filter facet.
 * These populate the filter dropdowns with live counts.
 */
export function getFilterFacets(filters: FilterOptions = {}): FilterFacets {
  const db = getDb();
  // Build base filter (excluding the facet we're counting for to keep them independent)
  const { conditions, params } = buildFilterClause(filters);
  const baseWhere = [ACTIVE_WHERE, ...conditions].join(" AND ");

  function getFacet(column: string): FacetItem[] {
    const sql = `
      SELECT ${column} as value, COUNT(*) as count
      FROM listings_feed
      WHERE ${baseWhere} AND ${column} IS NOT NULL AND ${column} != ''
      GROUP BY ${column}
      ORDER BY count DESC
    `;
    return db.prepare(sql).all(...params) as FacetItem[];
  }

  return {
    years: getFacet("year"),
    setNames: getFacet("set_name"),
    players: getFacet("player_name"),
    variants: getFacet("variant"),
    categories: getFacet("category"),
  };
}

/**
 * Full watchlist ordered by active-first, then alphabetical.
 */
export function getWatchlist(): WatchlistRow[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM watchlist
    ORDER BY is_active DESC, player_name ASC
  `);
  return stmt.all() as WatchlistRow[];
}

/**
 * Most recent scan run status. Used by the scan panel and polling endpoint.
 */
export function getLatestScanRun(): ScanRunRow | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1
  `);
  return (stmt.get() as ScanRunRow) ?? null;
}
