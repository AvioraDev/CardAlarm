import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  loadActiveStoreSources,
  loadScanSources,
  loadSourceFallback,
  NO_SCAN_SOURCES_MESSAGE,
  sourceFromStoreRow,
} from '../src/sources';
import type { DbClient } from '../src/db';

function mockDb(rows: unknown[]): DbClient {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as DbClient;
}

describe('scan source loading', () => {
  const originalFallbackEnv = process.env.CARDALARM_ALLOW_SOURCES_JSON_FALLBACK;

  afterEach(() => {
    if (originalFallbackEnv === undefined) {
      delete process.env.CARDALARM_ALLOW_SOURCES_JSON_FALLBACK;
    } else {
      process.env.CARDALARM_ALLOW_SOURCES_JSON_FALLBACK = originalFallbackEnv;
    }
    jest.restoreAllMocks();
  });

  it('maps active Shopify store rows to scan source config', () => {
    const source = sourceFromStoreRow({
      id: 1,
      slug: 'topplay',
      name: 'TopPlay Sports Cards',
      base_url: 'https://topplaysportscards.co.nz/',
      source_type: 'shopify',
      country_code: 'NZ',
      currency: 'NZD',
      scan_strategy: null,
      early_stop_enabled: null,
      early_stop_unchanged_pages: null,
    });

    expect(source).toEqual({
      slug: 'topplay',
      storeId: 1,
      name: 'TopPlay Sports Cards',
      baseUrl: 'https://topplaysportscards.co.nz',
      sourceType: 'shopify',
      countryCode: 'NZ',
      currency: 'NZD',
      scanStrategy: 'incremental',
      earlyStopEnabled: true,
      earlyStopUnchangedPages: 2,
    });
  });

  it('ignores non-Shopify store rows', () => {
    expect(sourceFromStoreRow({
      id: 2,
      slug: 'manual',
      name: 'Manual Store',
      base_url: 'https://example.com',
      source_type: 'manual',
      country_code: 'NZ',
      currency: 'NZD',
      scan_strategy: null,
      early_stop_enabled: null,
      early_stop_unchanged_pages: null,
    })).toBeNull();
  });

  it('loads active Shopify stores from the database', async () => {
    const db = mockDb([
      {
        id: 3,
        slug: 'dime-city-cards',
        name: 'Dime City Cards',
        base_url: 'https://dimecitycards.com/',
        source_type: 'shopify',
        country_code: null,
        currency: null,
        scan_strategy: 'full',
        early_stop_enabled: false,
        early_stop_unchanged_pages: 5,
      },
    ]);

    const sources = await loadActiveStoreSources(db);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('from public.stores'));
    expect(sources).toEqual([{
      slug: 'dime-city-cards',
      storeId: 3,
      name: 'Dime City Cards',
      baseUrl: 'https://dimecitycards.com',
      sourceType: 'shopify',
      countryCode: 'NZ',
      currency: 'NZD',
      scanStrategy: 'full',
      earlyStopEnabled: false,
      earlyStopUnchangedPages: 5,
    }]);
  });

  it('uses database stores before sources.json fallback', async () => {
    process.env.CARDALARM_ALLOW_SOURCES_JSON_FALLBACK = 'false';
    const db = mockDb([
      {
        id: 4,
        slug: 'db-store',
        name: 'Database Store',
        base_url: 'https://db.example',
        source_type: 'shopify',
        country_code: 'AU',
        currency: 'AUD',
        scan_strategy: 'incremental',
        early_stop_enabled: true,
        early_stop_unchanged_pages: 4,
      },
    ]);

    await expect(loadScanSources(db)).resolves.toEqual([{
      slug: 'db-store',
      storeId: 4,
      name: 'Database Store',
      baseUrl: 'https://db.example',
      sourceType: 'shopify',
      countryCode: 'AU',
      currency: 'AUD',
      scanStrategy: 'incremental',
      earlyStopEnabled: true,
      earlyStopUnchangedPages: 4,
    }]);
  });

  it('uses sources.json fallback when no database stores exist and fallback is enabled', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardalarm-sources-'));
    const tempFile = path.join(tempDir, 'sources.json');
    fs.writeFileSync(tempFile, JSON.stringify([
      {
        slug: 'json-store',
        name: 'JSON Store',
        baseUrl: 'https://json.example/',
      },
    ]));

    await expect(loadScanSources(mockDb([]), {
      fallbackPath: tempFile,
      allowSourcesJsonFallback: true,
    })).resolves.toEqual([{
      slug: 'json-store',
      name: 'JSON Store',
      baseUrl: 'https://json.example',
      sourceType: 'shopify',
      countryCode: 'NZ',
      currency: 'NZD',
      scanStrategy: 'incremental',
      earlyStopEnabled: true,
      earlyStopUnchangedPages: 2,
    }]);
  });

  it('returns no sources when no database stores exist and fallback is disabled', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(loadScanSources(mockDb([]), {
      allowSourcesJsonFallback: false,
    })).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(NO_SCAN_SOURCES_MESSAGE));
  });

  it('can load sources.json fallback for local development', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardalarm-sources-'));
    const tempFile = path.join(tempDir, 'sources.json');
    fs.writeFileSync(tempFile, JSON.stringify([
      {
        slug: 'json-store',
        name: 'JSON Store',
        baseUrl: 'https://json.example/',
      },
    ]));

    expect(loadSourceFallback(tempFile)).toEqual([{
      slug: 'json-store',
      name: 'JSON Store',
      baseUrl: 'https://json.example',
      sourceType: 'shopify',
      countryCode: 'NZ',
      currency: 'NZD',
      scanStrategy: 'incremental',
      earlyStopEnabled: true,
      earlyStopUnchangedPages: 2,
    }]);
  });
});
