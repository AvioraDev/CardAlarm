import fs from 'fs';
import path from 'path';
import type { DbClient } from './db';
import type { SourceConfig } from './types';

const DEFAULT_SOURCES_PATH = path.resolve(__dirname, '..', '..', 'sources.json');

type StoreRow = {
  slug: string;
  name: string;
  base_url: string;
  source_type: string;
  country_code: string | null;
  currency: string | null;
};

type SourceJsonRow = {
  name: string;
  slug: string;
  baseUrl: string;
  sourceType?: string;
  countryCode?: string;
  currency?: string;
};

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function normalizeSourceType(value: string | null | undefined): 'shopify' | null {
  return value?.toLowerCase() === 'shopify' ? 'shopify' : null;
}

export function sourceFromStoreRow(row: StoreRow): SourceConfig | null {
  const sourceType = normalizeSourceType(row.source_type);
  if (!sourceType || !row.slug.trim() || !row.name.trim() || !row.base_url.trim()) return null;

  return {
    slug: row.slug.trim(),
    name: row.name.trim(),
    baseUrl: normalizeBaseUrl(row.base_url),
    sourceType,
    countryCode: row.country_code?.trim() || 'NZ',
    currency: row.currency?.trim() || 'NZD',
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
  };
}

export function loadSourceFallback(filePath = DEFAULT_SOURCES_PATH): SourceConfig[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = JSON.parse(raw) as SourceJsonRow[];
  return rows.map(sourceFromJsonRow).filter((source): source is SourceConfig => source !== null);
}

export async function loadActiveStoreSources(db: DbClient): Promise<SourceConfig[]> {
  const result = await db.query<StoreRow>(
    `select slug, name, base_url, source_type, country_code, currency
     from public.stores
     where is_active = true
       and lower(source_type) = 'shopify'
     order by name asc`,
  );

  return result.rows.map(sourceFromStoreRow).filter((source): source is SourceConfig => source !== null);
}

export async function loadScanSources(db: DbClient): Promise<SourceConfig[]> {
  const dbSources = await loadActiveStoreSources(db);
  if (dbSources.length > 0) return dbSources;

  const fallbackSources = loadSourceFallback();
  console.warn('No active Shopify stores found in public.stores; falling back to sources.json for local development.');
  return fallbackSources;
}
