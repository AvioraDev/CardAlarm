import fs from 'fs';
import path from 'path';
import { closeDb, getDb } from '../db';
import { runWithConcurrency } from '../ingest';
import { toCsv } from '../accuracy/csv';
import { loadCatalogueIndex } from './catalogue-index';
import { classifyListing, JEV_CLASSIFIER_VERSION } from './classifier';
import { buildListingEvidence } from './evidence';
import { createJevClient } from './jev-client';

/**
 * Dry run of the current classifier over a sample of live listings, compared with the stored classification.
 * READ-ONLY: it reads listings, stored classifications and the catalogue, calls the model, and writes nothing
 * to the database. Used to report what a classifier change would do before any rollout (CAR-78).
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/classify/dry-run-compare.ts [--limit 300] [--seed car-78] [--out docs/accuracy/classifier-v2-dry-run.csv]
 */

interface Row {
  id: string;
  source: string;
  title: string;
  description: string | null;
  raw_latest_payload: unknown;
  old_status: string | null;
  old_product: string | null;
  old_card_id: string | null;
  old_player: string | null;
}

function option(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1]!;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limit = Number(option(args, '--limit', '300'));
  const seed = option(args, '--seed', 'car-78');
  const out = path.resolve(option(args, '--out', 'docs/accuracy/classifier-v2-dry-run.csv'));

  const db = getDb();
  try {
    const { rows } = await db.query<Row>(
      `select sp.id::text id, sp.source, sp.title, sp.description, sp.raw_latest_payload,
              pc.review_status old_status, pc.product_line old_product, pc.checklist_card_id::text old_card_id, pc.player_name old_player
       from public.product_classifications pc
       join public.store_products sp on sp.id = pc.store_product_id
       join public.stores s on s.id = sp.store_id and s.is_active
       where pc.classifier_type = 'jev' and sp.is_active and sp.current_availability
       order by md5(sp.id::text || $2)
       limit $1`,
      [limit, seed]
    );
    const catalogue = await loadCatalogueIndex(db);
    const jev = createJevClient();

    const results: Array<{ row: Row; status: string; reasons: string; product: string; card: string; fields: string; tokens: number }> = [];
    await runWithConcurrency(rows, 6, async row => {
      try {
        const evidence = buildListingEvidence({ source: row.source, title: row.title, description: row.description, raw_latest_payload: row.raw_latest_payload });
        const c = await classifyListing(evidence, catalogue, jev);
        results.push({
          row,
          status: c.reviewStatus,
          reasons: c.reviewReasons.join(' ; '),
          product: c.product ? `${c.product.season} ${c.product.productLine}` : '',
          card: c.card ? `#${c.card.cardNumber} ${c.card.playerName}${c.subset ? ` (${c.subset.name})` : ''}` : '',
          fields: c.matchedFields.join(','),
          tokens: c.inputTokens,
        });
      } catch (error) {
        results.push({ row, status: 'ERROR', reasons: error instanceof Error ? error.message : String(error), product: '', card: '', fields: '', tokens: 0 });
      }
    });

    const matrix = new Map<string, number>();
    for (const r of results) {
      const key = `${r.row.old_status ?? 'none'} -> ${r.status}`;
      matrix.set(key, (matrix.get(key) ?? 0) + 1);
    }
    console.log(`Classifier ${JEV_CLASSIFIER_VERSION}: ${results.length} listings, ${results.reduce((a, r) => a + r.tokens, 0)} input tokens`);
    for (const [key, count] of [...matrix.entries()].sort()) console.log(`  ${String(count).padStart(5)}  ${key}`);

    const header = ['store_product_id', 'title', 'old_status', 'old_product', 'old_card_matched', 'new_status', 'new_product', 'new_card', 'matched_fields', 'reasons'];
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      toCsv([header, ...results.sort((a, b) => Number(a.row.id) - Number(b.row.id)).map(r => [r.row.id, r.row.title, r.row.old_status ?? '', r.row.old_product ?? '', r.row.old_card_id ? 'yes' : 'no', r.status, r.product, r.card, r.fields, r.reasons])]),
      'utf8'
    );
    console.log(`Wrote ${out}`);
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
