// ─── Database Row Types ────────────────────────────────────────────
// Mirrored from engine/src/types.ts to avoid cross-package imports.
// The engine and web share the same SQLite schema but are independent processes.

export interface ListingRow {
  id: number;
  external_id: string;
  source: string;
  title: string;
  price: number | null;
  url: string;
  image_url: string;
  match_type: string;
  is_dismissed: boolean;
  is_saved: boolean;
  is_dismissed_for_user: boolean;
  is_not_match_for_user: boolean;
  is_oos: boolean;
  created_at: string;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  player_name: string | null;
  variant: string | null;
  is_serial: boolean;
  serial_number: string | null;
  serial_current: string | null;
  serial_limit: string | null;
  is_auto: boolean;
  is_rookie: boolean;
  category: string | null;
  match_confidence: number | null;
  match_status: string | null;
  match_reasons: string[] | null;
  unmatched_fields: string[] | null;
  matcher_version: string | null;
}

export interface StoreRow {
  id: number;
  slug: string;
  name: string;
  base_url: string;
  source_type: string;
  country_code: string | null;
  currency: string | null;
  is_active: boolean;
  scan_frequency_minutes: number;
  scan_strategy: "incremental" | "full";
  early_stop_enabled: boolean;
  early_stop_unchanged_pages: number;
  last_successful_scan_at: string | null;
  last_failed_scan_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserWatchlistRuleRow {
  id: number;
  watchlist_id: number;
  player_id: number | null;
  team_id: number | null;
  brand: string | null;
  product_line: string | null;
  season: string | null;
  set_id: number | null;
  card_number: string | null;
  parallel: string | null;
  rookie_only: boolean;
  autograph_only: boolean;
  relic_only: boolean;
  serial_numbered_only: boolean;
  graded_only: boolean;
  raw_only: boolean;
  min_price: number | null;
  max_price: number | null;
  currency: string | null;
  include_terms: string | null;
  exclude_terms: string | null;
  minimum_match_confidence: number;
  created_at: string;
  updated_at: string;
}

export interface UserWatchlistRow {
  id: number;
  user_id: string;
  name: string;
  is_active: boolean;
  notification_enabled: boolean;
  created_at: string;
  updated_at: string;
  rules: UserWatchlistRuleRow[];
  match_count: number;
}

export interface FeedStats {
  total: number;
  direct: number;
  stealth: number;
  confirmed: number;
  possible: number;
  serialized: number;
}

export interface WatchlistDashboardStats {
  total: number;
  current: number;
  possible: number;
  watchlists: number;
  serialized: number;
}

// ─── Filter Types ──────────────────────────────────────────────────

export interface FilterOptions {
  watchlistId?: string;
  source?: string;
  year?: string;
  setName?: string;
  player?: string;
  team?: string;
  variant?: string;
  matchType?: string;
  matchStatus?: string;
  category?: string;
  isSerial?: string;    // "1" or "0"
  isAuto?: string;      // "1" or "0"
  isRookie?: string;    // "1" or "0"
  watchlistOnly?: string; // "1" or "0"
  priceMin?: string;
  priceMax?: string;
  search?: string;
}

export interface WatchlistChipRow {
  id: number;
  name: string;
  match_count: number;
}

export interface FilterFacets {
  sources: FacetItem[];
  years: FacetItem[];
  setNames: FacetItem[];
  players: FacetItem[];
  variants: FacetItem[];
  categories: FacetItem[];
}

export interface FacetItem {
  value: string;
  count: number;
}

// ─── Scan Engine Types ─────────────────────────────────────────────

export type ScanMode = "watchlist" | "full";

export interface ScanRunRow {
  id: number;
  mode: ScanMode;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
  processed: number;
  matched: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface StoreScanRunRow {
  id: number;
  store_id: number | null;
  store_slug: string;
  store_name: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  products_seen: number;
  products_processed: number;
  products_matched: number;
  products_marked_unavailable: number;
  scan_strategy: "incremental" | "full" | null;
  early_stop_enabled: boolean;
  early_stop_unchanged_pages: number | null;
  stopped_early: boolean;
  pages_fetched: number;
  error_message: string | null;
}
