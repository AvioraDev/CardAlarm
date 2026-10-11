import fs from 'fs';
import path from 'path';
import { closeDb, getDb } from '../db';
import { toCsv } from './csv';

/**
 * Exports a blind sample of live listings for hand labelling (CAR-63).
 *
 * "Blind" means no classifier output is included, so labelling is not anchored on a prediction.
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/accuracy/export-sample.ts [options]
 *
 *   --size N     listings likely to be basketball singles (default 270)
 *   --gate N     listings neither classifier calls a basketball single, to catch what the gate misses (default 30)
 *   --seed TEXT  makes the sample reproducible (default "car-63")
 *   --out PATH   output file (default docs/accuracy/sample-001.csv). Never overwrites an existing file.
 *
 * The sample is split evenly across stores, so a large store does not drown out the small ones.
 */

const LABEL_COLUMNS = [
  'item_type',
  'sport',
  'year',
  'product_line',
  'player',
  'card_number',
  'parallel',
  'is_rookie',
  'is_auto',
  'serial_limit',
  'notes',
];

function option(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function plainText(html: string | null, max: number): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

interface SampleRow {
  id: string;
  store: string;
  title: string | null;
  price: string | null;
  product_url: string | null;
  image_url: string | null;
  description: string | null;
}

const SAMPLE_SQL = `
  with population as (
    select
      sp.id, s.slug as store, sp.title, sp.current_price::text as price, coalesce(sp.product_url, sp.canonical_url) as product_url,
      sp.image_url, sp.description,
      (
        exists (select 1 from public.product_classifications d where d.store_product_id = sp.id and d.classifier_type = 'deterministic' and d.category = 'NBA')
        or exists (select 1 from public.product_classifications j where j.store_product_id = sp.id and j.classifier_type = 'jev' and j.sport = 'basketball' and j.item_type = 'single_card')
      ) as likely_single
    from public.store_products sp
    join public.stores s on s.id = sp.store_id and s.is_active = true
    where sp.is_active = true and sp.current_availability = true
  ),
  ranked as (
    select *, row_number() over (partition by store, likely_single order by md5(id::text || $1)) as rank_in_store
    from population
  ),
  stores_per_bucket as (
    select likely_single, count(distinct store) as n from population group by 1
  )
  select r.id::text, r.store, r.title, r.price, r.product_url, r.image_url, r.description
  from ranked r
  join stores_per_bucket b on b.likely_single = r.likely_single
  where r.rank_in_store <= ceil((case when r.likely_single then $2::numeric else $3::numeric end) / b.n)
  order by md5(r.id::text || $1 || 'order')`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const size = Number(option(args, '--size') ?? 270);
  const gate = Number(option(args, '--gate') ?? 30);
  const seed = option(args, '--seed') ?? 'car-63';
  const out = path.resolve(option(args, '--out') ?? 'docs/accuracy/sample-001.csv');

  if (fs.existsSync(out)) {
    throw new Error(`${out} already exists and may hold labels. Pick another --out or move the file.`);
  }

  const db = getDb();
  try {
    const result = await db.query<SampleRow>(SAMPLE_SQL, [seed, size, gate]);
    const header = ['store_product_id', 'store', 'title', 'price', 'product_url', 'image_url', 'description', ...LABEL_COLUMNS];
    const rows = result.rows.map(row => [
      row.id,
      row.store,
      row.title ?? '',
      row.price ?? '',
      row.product_url ?? '',
      row.image_url ?? '',
      plainText(row.description, 400),
      ...LABEL_COLUMNS.map(() => ''),
    ]);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, toCsv([header, ...rows]), 'utf8');
    console.log(`Wrote ${rows.length} listings to ${out} (seed "${seed}").`);
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
