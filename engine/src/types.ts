// ─── Shopify API Response ──────────────────────────────────────────
export interface ShopifyVariant {
  id: number;
  price: string;
  available: boolean;
}

export interface ShopifyImage {
  src: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  body_html?: string;
  vendor?: string;
  product_type?: string;
}

export interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

// ─── Source Configuration ──────────────────────────────────────────
export interface SourceConfig {
  storeId?: number | null;
  name: string;
  slug: string;
  baseUrl: string;
  sourceType: 'shopify';
  countryCode: string;
  currency: string;
  scanStrategy: 'incremental' | 'full';
  earlyStopEnabled: boolean;
  earlyStopUnchangedPages: number;
}

// ─── Internal Pipeline Objects ─────────────────────────────────────
export interface RawListing {
  externalId: string;
  source: string;
  title: string;
  price: number;
  url: string;
  imageUrl: string;
}

export interface ListingInsert extends RawListing {
  matchType: 'Direct' | 'Stealth';
  year: string | null;
  setName: string | null;
  cardNumber: string | null;
  playerName: string | null;
  variant: string | null;
  isSerial: boolean;
  serialNumber: string | null;
  serialCurrent: string | null;
  serialLimit: string | null;
  isAuto: boolean;
  isRookie: boolean;
  category: string;
  matchConfidence: number;
  matchStatus: 'confirmed' | 'possible';
  matchReasons: string[];
  unmatchedFields: string[];
  matcherVersion: string;
}

// ─── Title Metadata (output of parse-title.ts) ────────────────────
export interface TitleMetadata {
  year: string | null;
  setName: string | null;
  cardNumber: string | null;
  playerName: string | null;
  variant: string | null;
  isSerial: boolean;
  serialNumber: string | null;
  serialCurrent: string | null;
  serialLimit: string | null;
  isAuto: boolean;
  isRookie: boolean;
  category: string;
}

// ─── Database Row Types ────────────────────────────────────────────
export interface ChecklistRow {
  id: number;
  year: number;
  set_name: string;
  card_number: string;
  player_name: string;
}

export interface WatchlistRow {
  id: number;
  player_name: string;
  variants: string;
  target_numbers: string | null;
  is_active: boolean;
}

export interface ListingRow {
  id: number;
  external_id: string;
  source: string;
  title: string;
  price: number;
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

export interface SourceProductCacheInput {
  storeId: number | null;
  source: string;
  externalId: string;
  handle: string;
  title: string;
  price: number;
  available: boolean;
  url: string;
  imageUrl: string;
  description: string;
  rawPayload: string;
  contentHash: string;
  scanToken: string;
}

export interface SourceProductRow {
  source: string;
  external_id: string;
  handle: string;
  title: string;
  price: number;
  available: boolean;
  url: string;
  image_url: string;
  description: string | null;
  normalized_title: string | null;
  raw_latest_payload: string | null;
  content_hash: string;
  last_matched_hash: string | null;
  last_matched_context_hash: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_seen_scan_token: string | null;
}

export interface SourceProductCacheStatus {
  externalId: string;
  contentHash: string;
  isNew: boolean;
  changed: boolean;
  shouldMatch: boolean;
}

// ─── Extraction & Match Results ────────────────────────────────────
export interface ExtractionResult {
  cardNumber: string | null;
  setContext: string | null;
}

export interface MatchResult {
  matched: boolean;
  matchType: 'Direct' | 'Stealth' | null;
  playerName: string | null;
  confidence: number;
  status: 'confirmed' | 'possible' | null;
  reasons: string[];
  unmatchedFields: string[];
}

// ─── Scan Engine Types ─────────────────────────────────────────────
export type ScanMode = 'watchlist' | 'full';

export interface ScanRunRow {
  id: number;
  mode: ScanMode;
  status: 'running' | 'completed' | 'failed';
  processed: number;
  matched: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface StoreScanRunUpdate {
  status?: 'running' | 'completed' | 'failed' | 'cancelled';
  productsSeen?: number;
  productsProcessed?: number;
  productsMatched?: number;
  productsMarkedUnavailable?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}
