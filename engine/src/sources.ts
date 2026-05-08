import fs from 'fs';
import path from 'path';
import type { DbClient } from './db';
import type { SourceConfig } from './types';

const DEFAULT_SOURCES_PATH = path.resolve(__dirname, '..', '..', 'sources.json');
const SOURCES_JSON_FALLBACK_ENV = 'CARDALARM_ALLOW_SOURCES_JSON_FALLBACK';
export const NO_SCAN_SOURCES_MESSAGE = 'No active scan sources configured. Add or activate Shopify stores under /admin/stores.';

type StoreRow = {
  id: number;
  slug: string;
  name: string;
  base_url: string;
  source_type: string;
  country_code: string | null;
  currency: string | null;
  scan_strategy: string | null;
  early_stop_enabled: boolean | null;
  early_stop_unchanged_pages: number | null;
};

type SourceJsonRow = {
  name: string;
  slug: string;
  baseUrl: string;
  sourceType?: string;
  countryCode?: string;
  currency?: string;
  scanStrategy?: string;
  earlyStopEnabled?: boolean;
  earlyStopUnchangedPages?: number;
};

type LoadScanSourcesOptions = {
  fallbackPath?: string;
  allowSourcesJsonFallback?: boolean;
};

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function allowSourcesJsonFallback(options: LoadScanSourcesOptions): boolean {
  return options.allowSourcesJsonFallback ?? process.env[SOURCES_JSON_FALLBACK_ENV]?.toLowerCase() === 'true';
}

function normalizeSourceType(value: string | null | undefined): 'shopify' | null {
  return value?.toLowerCase() === 'shopify' ? 'shopify' : null;
}

function normalizeScanStrategy(value: string | null | undefined): 'incremental' | 'full' {
  return value?.toLowerCase() === 'full' ? 'full' : 'incremental';
}

function normalizeEarlyStopPages(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 2;
}

export function sourceFromStoreRow(row: StoreRow): SourceConfig | null {
  const sourceType = normalizeSourceType(row.source_type);
  if (!sourceType || !row.slug.trim() || !row.name.trim() || !row.base_url.trim()) return null;

  return {
    slug: row.slug.trim(),
    storeId: row.id,
    name: row.name.trim(),
    baseUrl: normalizeBaseUrl(row.base_url),
    sourceType,
    countryCode: row.country_code?.trim() || 'NZ',
    currency: row.currency?.trim() || 'NZD',
    scanStrategy: normalizeScanStrategy(row.scan_strategy),
    earlyStopEnabled: row.early_stop_enabled ?? true,
    earlyStopUnchangedPages: normalizeEarlyStopPages(row.early_stop_unchanged_pages),
  };
}

function sourceFromJsonRow(row: SourceJsonRow): SourceConfig | null {
  const sourceType = normalizeSourceType(row.sourceType ?? 'shopify');
  if (!sourceType || !row.slug?.trim() || !row.name?.trim() || !row.baseUrl?.trim()) return null;

  return {
    slug: row.slug.trim(),
    name: row.name.trim(),
    baseUrl: normalizeBaseUrl(row.baseUrl),
    sourceType,
    countryCode: row.countryCode?.trim() || 'NZ',
    currency: row.currency?.trim() || 'NZD',
    scanStrategy: normalizeScanStrategy(row.scanStrategy),
    earlyStopEnabled: row.earlyStopEnabled ?? true,
    earlyStopUnchangedPages: normalizeEarlyStopPages(row.earlyStopUnchangedPages),
  };
}

export function loadSourceFallback(filePath = DEFAULT_SOURCES_PATH): SourceConfig[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = JSON.parse(raw) as SourceJsonRow[];
  return rows.map(sourceFromJsonRow).filter((source): source is SourceConfig => source !== null);
}

export async function loadActiveStoreSources(db: DbClient): Promise<SourceConfig[]> {
  const result = await db.query<StoreRow>(
    `select
       id,
       slug,
       name,
       base_url,
       source_type,
       country_code,
       currency,
       coalesce(scan_strategy, 'incremental') as scan_strategy,
       coalesce(early_stop_enabled, true) as early_stop_enabled,
       coalesce(early_stop_unchanged_pages, 2) as early_stop_unchanged_pages
     from public.stores
     where is_active = true
       and lower(source_type) = 'shopify'
     order by name asc`,
  );

  return result.rows.map(sourceFromStoreRow).filter((source): source is SourceConfig => source !== null);
}

export async function loadScanSources(db: DbClient, options: LoadScanSourcesOptions = {}): Promise<SourceConfig[]> {
  const dbSources = await loadActiveStoreSources(db);
  if (dbSources.length > 0) return dbSources;

  if (!allowSourcesJsonFallback(options)) {
    console.warn(`${NO_SCAN_SOURCES_MESSAGE} Set ${SOURCES_JSON_FALLBACK_ENV}=true only for local sources.json fallback.`);
    return [];
  }

  const fallbackSources = loadSourceFallback(options.fallbackPath);
  console.warn(`No active Shopify stores found in public.stores; ${SOURCES_JSON_FALLBACK_ENV}=true, using sources.json fallback for local development.`);
  return fallbackSources;
}
