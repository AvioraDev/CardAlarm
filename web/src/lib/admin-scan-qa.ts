import "server-only";

import { requireAdmin } from "./auth";
import { query } from "./db";

const DEFAULT_MATCH_LIMIT = 100;
const MAX_MATCH_LIMIT = 200;
const LOW_CONFIDENCE_THRESHOLD = 0.75;

export interface ScanQaSearchParams {
  watchlistId?: string | string[];
  source?: string | string[];
  status?: string | string[];
  lowConfidence?: string | string[];
  rookieOnly?: string | string[];
  availability?: string | string[];
  limit?: string | string[];
}

export interface ScanQaFilters {
  watchlistId?: number;
  source?: string;
  status?: string;
  lowConfidence: boolean;
  rookieOnly: boolean;
  availability?: "current" | "possible";
  limit: number;
}

export interface ScanQaSummaryRow {
  scan_job_id: number | null;
  scan_run_id: number | null;
  mode: string | null;
  status: string | null;
  processed: number;
  matched: number;
  attempts: number | null;
  locked_by: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface ScanQaStoreRunRow {
  id: number;
  store_slug: string;
  status: string;
  products_seen: number;
  products_processed: number;
  products_matched: number;
  products_marked_unavailable: number;
  pages_fetched: number;
  stop_reason: string | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ScanQaWatchlistOption {
  id: number;
  name: string;
}

export interface ScanQaSourceOption {
  source: string;
}

export interface ScanQaMatchRow {
  watchlist_match_id: number;
  watchlist_match_status: string | null;
  watchlist_match_confidence: number | null;
  created_at: string;
  updated_at: string;
  watchlist_name: string;
  rookie_only: boolean;
  include_terms: string | null;
  exclude_terms: string | null;
  brand: string | null;
  product_line: string | null;
  season: string | null;
  card_number: string | null;
  parallel: string | null;
  minimum_match_confidence: number | null;
  store_product_id: number;
  source: string;
  title: string;
  product_url: string;
  image_url: string | null;
  current_price: string | number | null;
  currency: string | null;
  current_availability: boolean;
  category: string | null;
  year: string | null;
  classified_player_name: string | null;
  set_name: string | null;
  classified_product_line: string | null;
  classified_card_number: string | null;
  is_rookie: boolean | null;
  is_auto: boolean | null;
  is_serial: boolean | null;
  classification_confidence: number | null;
  product_card_match_id: number | null;
  matched_player_name: string | null;
  matched_player_id: number | null;
  checklist_id: number | null;
  identity_confidence: number | null;
  identity_status: string | null;
  matched_fields: unknown;
  match_reasons: unknown;
  unmatched_fields: unknown;
  matcher_version: string | null;
}

export interface ScanQaData {
  filters: ScanQaFilters;
  summary: ScanQaSummaryRow | null;
  storeRuns: ScanQaStoreRunRow[];
  matches: ScanQaMatchRow[];
  watchlists: ScanQaWatchlistOption[];
  sources: ScanQaSourceOption[];
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function cleanText(value: string | string[] | undefined): string | undefined {
  const text = firstParam(value)?.trim();
  return text ? text : undefined;
}

function boundedLimit(value: string | string[] | undefined): number {
  const parsed = Number.parseInt(firstParam(value) ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MATCH_LIMIT;
  return Math.min(Math.max(parsed, 1), MAX_MATCH_LIMIT);
}

function parseWatchlistId(value: string | string[] | undefined): number | undefined {
  const parsed = Number.parseInt(firstParam(value) ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseScanQaFilters(searchParams: ScanQaSearchParams = {}): ScanQaFilters {
  const status = cleanText(searchParams.status);
  const availability = cleanText(searchParams.availability);

  return {
    watchlistId: parseWatchlistId(searchParams.watchlistId),
    source: cleanText(searchParams.source),
    status: status && status !== "all" ? status : undefined,
    lowConfidence: cleanText(searchParams.lowConfidence) === "1",
    rookieOnly: cleanText(searchParams.rookieOnly) === "1",
    availability: availability === "current" || availability === "possible" ? availability : undefined,
    limit: boundedLimit(searchParams.limit),
  };
}

async function getLatestScanSummary(): Promise<ScanQaSummaryRow | null> {
  const jobRows = await query<ScanQaSummaryRow>(
    `select
       sj.id as scan_job_id,
       sj.scan_run_id,
       sj.mode,
       sj.status,
       coalesce(sj.processed, sr.processed, 0) as processed,
       coalesce(sj.matched, sr.matched, 0) as matched,
       sj.attempts,
       sj.locked_by,
       coalesce(sj.error, sr.error) as error,
       coalesce(sj.started_at, sr.started_at) as started_at,
       coalesce(sj.completed_at, sr.completed_at) as completed_at,
       sj.updated_at
     from public.scan_jobs sj
     left join public.scan_runs sr on sr.id = sj.scan_run_id
     order by
       case when sj.status in ('queued', 'running') then 0 else 1 end,
       coalesce(sj.updated_at, sj.created_at) desc
     limit 1`,
  );

  if (jobRows[0]) return jobRows[0];

  const runRows = await query<ScanQaSummaryRow>(
    `select
       null::bigint as scan_job_id,
       sr.id as scan_run_id,
       sr.mode,
       sr.status,
       sr.processed,
       sr.matched,
       null::integer as attempts,
       null::text as locked_by,
       sr.error,
       sr.started_at,
       sr.completed_at,
       sr.completed_at as updated_at
     from public.scan_runs sr
     order by sr.started_at desc
     limit 1`,
  );

  return runRows[0] ?? null;
}

async function getStoreProgress(summary: ScanQaSummaryRow | null): Promise<ScanQaStoreRunRow[]> {
  const params: unknown[] = [];
  let windowFilter = "";
  if (summary?.started_at) {
    params.push(summary.started_at);
    windowFilter = `where ssr.started_at >= ($1::timestamptz - interval '1 minute')`;
    if (summary.completed_at) {
      params.push(summary.completed_at);
      windowFilter += ` and ssr.started_at <= ($2::timestamptz + interval '5 minutes')`;
    }
  }

  return query<ScanQaStoreRunRow>(
    `select
       ssr.id,
       ssr.store_slug,
       ssr.status,
       coalesce(ssr.products_seen, 0) as products_seen,
       coalesce(ssr.products_processed, 0) as products_processed,
       coalesce(ssr.products_matched, 0) as products_matched,
       coalesce(ssr.products_marked_unavailable, 0) as products_marked_unavailable,
       coalesce((ssr.metadata->>'pagesFetched')::integer, 0) as pages_fetched,
       ssr.metadata->>'stopReason' as stop_reason,
       ssr.error_message,
       ssr.started_at,
       ssr.completed_at
     from public.store_scan_runs ssr
     ${windowFilter}
     order by ssr.started_at desc
     limit 24`,
    params,
  );
}

function scanWindowSql(summary: ScanQaSummaryRow | null, params: unknown[]): string {
  if (!summary?.started_at) return "";
  params.push(summary.started_at);
  const startedParam = params.length;

  if (!summary.completed_at) {
    return `and wm.updated_at >= $${startedParam}`;
  }

  params.push(summary.completed_at);
  return `and wm.updated_at between $${startedParam} and ($${params.length}::timestamptz + interval '5 minutes')`;
}

function matchFilterSql(filters: ScanQaFilters, params: unknown[]): string {
  const clauses: string[] = [];

  if (filters.watchlistId) {
    params.push(filters.watchlistId);
    clauses.push(`w.id = $${params.length}`);
  }

  if (filters.source) {
    params.push(filters.source);
    clauses.push(`sp.source = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`coalesce(wm.status, pcm.status, 'current') = $${params.length}`);
  }

  if (filters.lowConfidence) {
    clauses.push(
      `(
        coalesce(wm.confidence, 1) < ${LOW_CONFIDENCE_THRESHOLD}
        or coalesce(pcm.confidence, 1) < ${LOW_CONFIDENCE_THRESHOLD}
        or coalesce(pc.confidence, 1) < ${LOW_CONFIDENCE_THRESHOLD}
      )`,
    );
  }

  if (filters.rookieOnly) {
    clauses.push(`wr.rookie_only = true`);
  }

  if (filters.availability === "current") {
    clauses.push(`sp.current_availability = true`);
  } else if (filters.availability === "possible") {
    clauses.push(`coalesce(wm.status, pcm.status) = 'possible'`);
  }

  return clauses.length > 0 ? `and ${clauses.join("\n       and ")}` : "";
}

async function getRecentMatches(summary: ScanQaSummaryRow | null, filters: ScanQaFilters): Promise<ScanQaMatchRow[]> {
  const params: unknown[] = [];
  const windowSql = scanWindowSql(summary, params);
  const filtersSql = matchFilterSql(filters, params);
  params.push(filters.limit);

  return query<ScanQaMatchRow>(
    `select
       wm.id as watchlist_match_id,
       wm.status as watchlist_match_status,
       wm.confidence as watchlist_match_confidence,
       wm.created_at,
       wm.updated_at,
       w.name as watchlist_name,
       wr.rookie_only,
       wr.include_terms,
       wr.exclude_terms,
       wr.brand,
       wr.product_line,
       wr.season,
       wr.card_number,
       wr.parallel,
       wr.minimum_match_confidence,
       sp.id as store_product_id,
       sp.source,
       sp.title,
       sp.product_url,
       sp.image_url,
       sp.current_price,
       sp.currency,
       sp.current_availability,
       pc.category,
       pc.year,
       pc.player_name as classified_player_name,
       pc.set_name,
       pc.product_line as classified_product_line,
       pc.card_number as classified_card_number,
       pc.is_rookie,
       pc.is_auto,
       pc.is_serial,
       pc.confidence as classification_confidence,
       pcm.id as product_card_match_id,
       pcm.matched_player_name,
       pcm.matched_player_id,
       pcm.checklist_id,
       pcm.confidence as identity_confidence,
       pcm.status as identity_status,
       pcm.matched_fields,
       pcm.match_reasons,
       pcm.unmatched_fields,
       pcm.matcher_version
     from public.watchlist_matches wm
     join public.watchlists w on w.id = wm.watchlist_id
     join public.watchlist_rules wr on wr.id = wm.watchlist_rule_id
     join public.store_products sp on sp.id = wm.store_product_id
     left join lateral (
       select *
       from public.product_classifications pc
       where pc.store_product_id = sp.id
         and pc.classifier_type = 'deterministic'
       order by pc.updated_at desc
       limit 1
     ) pc on true
     left join public.product_card_matches pcm on pcm.id = wm.product_card_match_id
     where 1 = 1
       ${windowSql}
       ${filtersSql}
     order by wm.updated_at desc
     limit $${params.length}`,
    params,
  );
}

async function getWatchlistOptions(): Promise<ScanQaWatchlistOption[]> {
  return query<ScanQaWatchlistOption>(
    `select id, name
     from public.watchlists
     order by lower(name) asc, name asc
     limit 500`,
  );
}

async function getSourceOptions(): Promise<ScanQaSourceOption[]> {
  return query<ScanQaSourceOption>(
    `select source
     from (
       select source
       from public.store_products
       where source is not null
         and source != ''
       group by source
     ) sources
     order by lower(source) asc, source asc
     limit 200`,
  );
}

export async function getAdminScanQaData(searchParams: ScanQaSearchParams = {}): Promise<ScanQaData> {
  await requireAdmin();
  const filters = parseScanQaFilters(searchParams);
  const summary = await getLatestScanSummary();
  const [storeRuns, matches, watchlists, sources] = await Promise.all([
    getStoreProgress(summary),
    getRecentMatches(summary, filters),
    getWatchlistOptions(),
    getSourceOptions(),
  ]);

  return { filters, summary, storeRuns, matches, watchlists, sources };
}
