import fs from 'node:fs';
import path from 'node:path';
import { closeDb, getDb } from '../db';
import { loadCatalogueIndex } from '../classify/catalogue-index';

/**
 * Writes the fixture catalogue snapshot from the live catalogue (read-only).
 *
 * Products named in --full keep every subset, parallel and card. Every other product is exported as a bare row
 * (season, brand, line, source file), because alias generation looks at all product lines in the catalogue.
 *
 * Usage:
 *   npx tsx --env-file=web/.env.local engine/src/accuracy/export-catalogue-snapshot.ts --full "2024-25 Revolution,2020-21 Prizm" --out engine/__tests__/fixtures/catalogue-snapshot.json
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (flag: string): string | undefined => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const full = new Set((opt('--full') ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
  const out = path.resolve(opt('--out') ?? 'engine/__tests__/fixtures/catalogue-snapshot.json');
  const db = getDb();
  try {
    const catalogue = await loadCatalogueIndex(db);
    const products = catalogue.products.map(product => {
      const keep = full.has(`${product.season} ${product.productLine}`.toLowerCase());
      return {
        id: product.id,
        season: product.season,
        brand: product.brand,
        productLine: product.productLine,
        sourceFile: product.sourceFile ?? null,
        subsets: keep ? product.subsets : [],
      };
    });
    const note = `Real checklist_* rows touched by the 20 matcher fixtures, plus decoys, from the corrected catalogue (CAR-77 re-import). All other products are bare rows so alias generation sees every product line. Built ${new Date().toISOString().slice(0, 10)}.`;
    fs.writeFileSync(out, JSON.stringify({ note, products }) + '\n', 'utf8');
    console.log(`Wrote ${products.length} products (${products.filter(p => p.subsets.length > 0).length} in full) to ${out}`);
  } finally {
    await closeDb();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
