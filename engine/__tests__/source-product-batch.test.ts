import fs from 'node:fs';
import path from 'node:path';
import { buildSourceProductBatchRows } from '../src/db';
import type { SourceProductCacheInput } from '../src/types';

function product(overrides: Partial<SourceProductCacheInput> = {}): SourceProductCacheInput {
  return {
    storeId: 42,
    source: 'topplay',
    externalId: '1',
    handle: 'kevin-durant-prizm',
    title: 'Kevin Durant Prizm',
    price: 25,
    available: true,
    url: 'https://example.com/products/kevin-durant-prizm',
    imageUrl: 'https://example.com/image.jpg',
    description: 'Card description',
    rawPayload: JSON.stringify({ id: 1 }),
    contentHash: 'hash-1',
    scanToken: 'scan-1',
    ...overrides,
  };
}

describe('buildSourceProductBatchRows', () => {
  it('maps scanner products into batched database rows', () => {
    expect(buildSourceProductBatchRows([product()])).toEqual([
      {
        input_order: 0,
        store_id: 42,
        source: 'topplay',
        external_id: '1',
        handle: 'kevin-durant-prizm',
        title: 'Kevin Durant Prizm',
        price: 25,
        available: true,
        url: 'https://example.com/products/kevin-durant-prizm',
        image_url: 'https://example.com/image.jpg',
        description: 'Card description',
        normalized_title: 'kevin durant prizm',
        raw_payload: JSON.stringify({ id: 1 }),
        content_hash: 'hash-1',
        scan_token: 'scan-1',
      },
    ]);
  });

  it('deduplicates repeated source product keys before batched upsert', () => {
    const rows = buildSourceProductBatchRows([
      product({ externalId: '1', title: 'Old Title', contentHash: 'old' }),
      product({ externalId: '2', title: 'Second Title', contentHash: 'second' }),
      product({ externalId: '1', title: 'New Title', contentHash: 'new' }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.external_id)).toEqual(['2', '1']);
    expect(rows.find(row => row.external_id === '1')).toMatchObject({
      title: 'New Title',
      normalized_title: 'new title',
      content_hash: 'new',
    });
  });

  it('allows fallback sources to omit a database store id', () => {
    expect(buildSourceProductBatchRows([product({ storeId: null })])).toMatchObject([
      {
        store_id: null,
        source: 'topplay',
        external_id: '1',
      },
    ]);
  });

  it('references store_id in the generated store product upsert SQL', () => {
    const dbSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'db.ts'), 'utf8');

    expect(dbSource).toContain('store_id integer');
    expect(dbSource).toContain('store_id, source, external_product_id');
    expect(dbSource).toContain('store_id = coalesce(excluded.store_id, store_products.store_id)');
  });
});
