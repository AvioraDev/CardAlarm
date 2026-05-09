import { closeDb, getDb, upsertProductClassificationsById } from './db';
import { buildProductClassificationRows, type ProductClassificationByIdRow } from './product-classification';
import type { SourceProductCacheInput } from './types';

export type BackfillOptions = {
  source: string | null;
  limit: number | null;
  dryRun: boolean;
};

export type StoreProductBackfillRow = {
  id: number;
  store_id: number | null;
  source: string;
  external_product_id: string;
  handle: string | null;
  title: string;
  current_price: number | null;
  current_availability: boolean;
  product_url: string | null;
  canonical_url: string | null;
  image_url: string | null;
  description: string | null;
  raw_latest_payload: unknown;
  product_fingerprint: string | null;
};

function readOptionValue(argv: string[], index: number, name: string): { value: string | null; consumed: number } {
  const current = argv[index];
  if (!current) return { value: null, consumed: 0 };
  if (current.startsWith(`${name}=`)) return { value: current.slice(name.length + 1), consumed: 1 };
  if (current === name) return { value: argv[index + 1] ?? null, consumed: 2 };
  return { value: null, consumed: 0 };
}

export function parseBackfillArgs(argv: string[]): BackfillOptions {
  let source: string | null = null;
  let limit: number | null = null;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    const sourceOption = readOptionValue(argv, index, '--source');
    if (sourceOption.consumed > 0) {
      source = sourceOption.value?.trim() || null;
      index += sourceOption.consumed - 1;
      continue;
    }

    const limitOption = readOptionValue(argv, index, '--limit');
    if (limitOption.consumed > 0) {
      const parsed = Number.parseInt(limitOption.value ?? '', 10);
      limit = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      index += limitOption.consumed - 1;
    }
  }

  return { source, limit, dryRun };
}

export function toClassificationCacheInput(row: StoreProductBackfillRow): SourceProductCacheInput {
  return {
    storeId: row.store_id,
    source: row.source,
    externalId: row.external_product_id,
    handle: row.handle ?? '',
    title: row.title,
    price: row.current_price ?? 0,
    available: row.current_availability,
    url: row.product_url ?? row.canonical_url ?? '',
    imageUrl: row.image_url ?? '',
    description: row.description ?? '',
    rawPayload: JSON.stringify(row.raw_latest_payload ?? {}),
    contentHash: row.product_fingerprint ?? `${row.source}:${row.external_product_id}`,
    scanToken: 'classification-backfill',
  };
}

async function fetchProducts(options: BackfillOptions): Promise<StoreProductBackfillRow[]> {
  const params: unknown[] = [];
  const conditions = ['sp.is_active = true', 'sp.current_availability = true'];

  if (options.source) {
    params.push(options.source);
    conditions.push(`sp.source = $${params.length}`);
  }

  const limitSql = options.limit ? `limit $${params.length + 1}` : '';
  if (options.limit) params.push(options.limit);

  return getDb().query<StoreProductBackfillRow>(
    `select
       sp.id,
       sp.store_id,
       sp.source,
       sp.external_product_id,
       sp.handle,
       coalesce(sp.title, 'Untitled listing') as title,
       sp.current_price::float8 as current_price,
       sp.current_availability,
       sp.product_url,
       sp.canonical_url,
       sp.image_url,
       sp.description,
       sp.raw_latest_payload,
       sp.product_fingerprint
     from public.store_products sp
     where ${conditions.join(' and ')}
     order by sp.last_checked_at desc nulls last, sp.updated_at desc, sp.id desc
     ${limitSql}`,
    params
  ).then(result => result.rows);
}

export async function runBackfillProductClassifications(options: BackfillOptions): Promise<{
  selected: number;
  classified: number;
  dryRun: boolean;
}> {
  const products = await fetchProducts(options);
  const cacheInputs = products.map(toClassificationCacheInput);
  const rowsByKey = new Map(products.map(row => [`${row.source}\u0000${row.external_product_id}`, row.id]));
  const classifications: ProductClassificationByIdRow[] = buildProductClassificationRows(cacheInputs).map(row => ({
    ...row,
    store_product_id: rowsByKey.get(`${row.source}\u0000${row.external_id}`) ?? 0,
  })).filter(row => row.store_product_id > 0);

  if (!options.dryRun) {
    await upsertProductClassificationsById(getDb(), classifications);
  }

  return {
    selected: products.length,
    classified: classifications.length,
    dryRun: options.dryRun,
  };
}

async function main(): Promise<void> {
  const options = parseBackfillArgs(process.argv.slice(2));
  try {
    const result = await runBackfillProductClassifications(options);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
