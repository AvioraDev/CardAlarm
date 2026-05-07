// ─── Database Row Types ────────────────────────────────────────────
// Mirrored from engine/src/types.ts to avoid cross-package imports.
// The engine and web share the same SQLite schema but are independent processes.

export interface ListingRow {
  id: number;
  external_id: string;
  source: string;
  title: string;
  price: number;
  url: string;
  image_url: string;
  match_type: string;
  is_dismissed: number;
  is_oos: number;
  created_at: string;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  player_name: string | null;
  variant: string | null;
  is_serial: number;
  serial_number: string | null;
  serial_current: string | null;
  serial_limit: string | null;
  is_auto: number;
  is_rookie: number;
  category: string | null;
  match_confidence: number | null;
  match_status: string | null;
  match_reasons: string | null;
  unmatched_fields: string | null;
  matcher_version: string | null;
}

export interface WatchlistRow {
  id: number;
  player_name: string;
  variants: string;
  target_numbers: string | null;
  is_active: number;
}

export interface FeedStats {
  total: number;
  direct: number;
  stealth: number;
  confirmed: number;
  possible: number;
  serialized: number;
}

// ─── Filter Types ──────────────────────────────────────────────────

export interface FilterOptions {
  year?: string;
  setName?: string;
  player?: string;
  variant?: string;
  matchType?: string;
  category?: string;
  isSerial?: string;    // "1" or "0"
  isAuto?: string;      // "1" or "0"
  isRookie?: string;    // "1" or "0"
  watchlistOnly?: string; // "1" or "0"
  priceMin?: string;
  priceMax?: string;
  search?: string;
}

export interface FilterFacets {
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
  status: "running" | "completed" | "failed";
  processed: number;
  matched: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}
