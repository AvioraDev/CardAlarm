import fs from 'node:fs';
import path from 'node:path';
import { parseBackfillArgs, toClassificationCacheInput } from '../src/backfill-product-classifications';
import {
  buildProductClassificationRows,
  DETERMINISTIC_CLASSIFIER_TYPE,
  DETERMINISTIC_CLASSIFIER_VERSION,
} from '../src/product-classification';
import type { SourceProductCacheInput } from '../src/types';

function product(overrides: Partial<SourceProductCacheInput> = {}): SourceProductCacheInput {
  return {
    storeId: 42,
    source: 'topplay',
    externalId: '1',
    handle: 'kevin-durant-prizm-silver',
    title: '2023-24 Panini Prizm Basketball Silver #12 Kevin Durant',
    price: 25,
    available: true,
    url: 'https://example.com/products/kevin-durant-prizm-silver',
    imageUrl: 'https://example.com/image.jpg',
    description: 'Card description',
    rawPayload: JSON.stringify({ id: 1 }),
    contentHash: 'hash-1',
    scanToken: 'scan-1',
    ...overrides,
  };
}

describe('deterministic product classifications', () => {
  it('builds classification rows from cached products', () => {
    expect(buildProductClassificationRows([product()])).toEqual([
      expect.objectContaining({
        source: 'topplay',
        external_id: '1',
        classifier_version: DETERMINISTIC_CLASSIFIER_VERSION,
        classifier_type: DETERMINISTIC_CLASSIFIER_TYPE,
        status: 'classified',
        year: '2023-24',
        product_line: 'Panini Prizm Basketball',
        set_name: 'Panini Prizm Basketball',
        card_number: '12',
        player_name: 'Kevin Durant',
        variant_name: 'Silver',
        parallel_name: 'Silver',
        insert_name: null,
        is_rookie: false,
        is_auto: false,
        is_serial: false,
        category: 'NBA',
      }),
    ]);
  });

  it('skips unavailable products during active inventory classification', () => {
    expect(buildProductClassificationRows([product({ available: false })])).toEqual([]);
  });

  it('maps store_products rows into cache inputs for backfill dry runs', () => {
    expect(
      toClassificationCacheInput({
        id: 7,
        store_id: 42,
        source: 'topplay',
        external_product_id: 'abc',
        handle: 'shohei-topps-chrome',
        title: '2024 Topps Chrome Baseball Refractor #17 Shohei Ohtani',
        current_price: 12.5,
        current_availability: true,
        product_url: null,
        canonical_url: 'https://example.com/products/shohei-topps-chrome',
        image_url: null,
        description: null,
        raw_latest_payload: { id: 'abc' },
        product_fingerprint: 'hash-abc',
      })
    ).toMatchObject({
      storeId: 42,
      source: 'topplay',
      externalId: 'abc',
      title: '2024 Topps Chrome Baseball Refractor #17 Shohei Ohtani',
      available: true,
      url: 'https://example.com/products/shohei-topps-chrome',
      contentHash: 'hash-abc',
    });
  });

  it('parses backfill dry-run options', () => {
    expect(parseBackfillArgs(['--dry-run', '--source', 'topplay', '--limit=25'])).toEqual({
      source: 'topplay',
      limit: 25,
      dryRun: true,
    });
  });

  it('uses a batched upsert keyed by store product, version, and classifier type', () => {
    const dbSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'db.ts'), 'utf8');

    expect(dbSource).toContain('insert into product_classifications');
    expect(dbSource).toContain('on conflict (store_product_id, classifier_version, classifier_type) do update');
    expect(dbSource).toContain('jsonb_to_recordset($2::jsonb)');
  });
});
