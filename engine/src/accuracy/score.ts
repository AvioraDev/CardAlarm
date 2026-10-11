import fs from 'fs';
import path from 'path';
import { closeDb, getDb } from '../db';
import { parseCsvObjects } from './csv';
import { renderReport, scoreClassifier, type ClassifierName, type LabelledListing, type Prediction } from './scoring';

/**
 * Scores the deterministic and Jev classifiers against a hand-labelled CSV (CAR-63).
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/accuracy/score.ts [labels.csv] [--write report.md]
 *
 * Only rows with item_type filled in count as labelled, so a partly labelled sheet can be scored.
 */

interface PredictionRow {
  store_product_id: string;
  classifier_type: ClassifierName;
  category: string | null;
  item_type: string | null;
  sport: string | null;
  year: string | null;
  product_line: string | null;
  player_name: string | null;
  card_number: string | null;
  parallel_name: string | null;
  is_rookie: boolean | null;
  is_auto: boolean | null;
  serial_limit: string | null;
}

function toLabel(row: Record<string, string>): LabelledListing {
  return {
    storeProductId: Number(row.store_product_id),
    itemType: row.item_type ?? '',
    sport: row.sport ?? '',
    year: row.year ?? '',
    productLine: row.product_line ?? '',
    player: row.player ?? '',
    cardNumber: row.card_number ?? '',
    parallel: row.parallel ?? '',
    isRookie: row.is_rookie ?? '',
    isAuto: row.is_auto ?? '',
    serialLimit: row.serial_limit ?? '',
  };
}

function toPrediction(row: PredictionRow): Prediction {
  const isBasketballSingle =
    row.classifier_type === 'jev' ? row.item_type === 'single_card' && row.sport === 'basketball' : row.category === 'NBA';
  return {
    isBasketballSingle,
    year: row.year,
    productLine: row.product_line,
    player: row.player_name,
    cardNumber: row.card_number,
    parallel: row.parallel_name,
    isRookie: row.is_rookie,
    isAuto: row.is_auto,
    serialLimit: row.serial_limit,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const writeIndex = args.indexOf('--write');
  const writeTo = writeIndex === -1 ? undefined : args[writeIndex + 1];
  const file = path.resolve(args.find((arg, index) => !arg.startsWith('--') && (writeIndex === -1 || index !== writeIndex + 1)) ?? 'docs/accuracy/sample-001.csv');

  const labels = parseCsvObjects(fs.readFileSync(file, 'utf8'))
    .filter(row => (row.item_type ?? '').trim() !== '')
    .map(toLabel);
  if (labels.length === 0) throw new Error(`No labelled rows in ${file}. Fill in item_type (and the other label columns) first.`);

  const db = getDb();
  try {
    const result = await db.query<PredictionRow>(
      `select distinct on (pc.store_product_id, pc.classifier_type)
         pc.store_product_id::text, pc.classifier_type, pc.category, pc.item_type, pc.sport, pc.year, pc.product_line,
         pc.player_name, pc.card_number, pc.parallel_name, pc.is_rookie, pc.is_auto, pc.serial_limit
       from public.product_classifications pc
       where pc.store_product_id = any($1::bigint[]) and pc.classifier_type in ('deterministic', 'jev')
       order by pc.store_product_id, pc.classifier_type, pc.updated_at desc`,
      [labels.map(label => label.storeProductId)],
    );

    const byClassifier: Record<ClassifierName, Map<number, Prediction | null>> = {
      deterministic: new Map(),
      jev: new Map(),
    };
    for (const row of result.rows) byClassifier[row.classifier_type].set(Number(row.store_product_id), toPrediction(row));

    const report = renderReport(
      (['deterministic', 'jev'] as ClassifierName[]).map(name => scoreClassifier(name, labels, byClassifier[name])),
      labels.length,
    );
    console.log(report);
    if (writeTo) {
      fs.writeFileSync(path.resolve(writeTo), `# Classifier accuracy report\n\nSource: ${path.basename(file)}\n\n${report}\n`, 'utf8');
      console.log(`Wrote ${writeTo}`);
    }
  } finally {
    await closeDb();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
