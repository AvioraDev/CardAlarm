import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadActiveStoreSources, loadScanSources, loadSourceFallback, sourceFromStoreRow } from '../src/sources';
import type { DbClient } from '../src/db';

function mockDb(rows: unknown[]): DbClient {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  } as unknown as DbClient;
}

describe('scan source loading', () => {
  it('maps active Shopify store rows to scan source config', () => {
    const source = sourceFromStoreRow({
      slug: 'topplay',
      name: 'TopPlay Sports Cards',
      base_url: 'https://topplaysportscards.co.nz/',
      source_type: 'shopify',
      country_code: 'NZ',
      currency: 'NZD',
    });

    expect(source).toEqual({
      slug: 'topplay',
      name: 'TopPlay Sports Cards',
      baseUrl: 'https://topplaysportscards.co.nz',
      sourceType: 'shopify',
      countryCode: 'NZ',
      currency: 'NZD',
    });
  });

  it('ignores non-Shopify store rows', () => {
    expect(sourceFromStoreRow({
      slug: 'manual',
      name: 'Manual Store',
      base_url: 'https://example.com',
      source_type: 'manual',
      country_code: 'NZ',
      currency: 'NZD',
    })).toBeNull();
  });

  it('loads active Shopify stores from the database', async () => {
    const db = mockDb([
      {
        slug: 'dime-city-cards',
        name: 'Dime City Cards',
        base_url: 'https://dimecitycards.com/',
        source_type: 'shopify',
        country_code: null,
        currency: null,
      },
    ]);

    const sources = await loadActiveStoreSources(db);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('from public.stores'));
    expect(sources).toEqual([{
      slug: 'dime-city-cards',
      name: 'Dime City Cards',
      baseUrl: 'https://dimecitycards.com',
      sourceType: 'shopify',
      countryCode: 'NZ',
      currency: 'NZD',
    }]);
  });

  it('uses database stores before sources.json fallback', async () => {
    const db = mockDb([
      {
        slug: 'db-store',
        name: 'Database Store',
        base_url: 'https://db.example',
        source_type: 'shopify',
        country_code: 'AU',
        currency: 'AUD',
      },
    ]);

    await expect(loadScanSources(db)).resolves.toEqual([{
      slug: 'db-store',
      name: 'Database Store',
      baseUrl: 'https://db.example',
      sourceType: 'shopify',
      countryCode: 'AU',
      currency: 'AUD',
    }]);
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
    }]);
  });
});
