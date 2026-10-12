import { closeDb, getDb } from '../db';
import { loadCatalogueIndex } from './catalogue-index';
import { classifyListing } from './classifier';
import { buildListingEvidence } from './evidence';
import { createJevClient } from './jev-client';

/** Classifies the given store_product ids with the current code and prints the result. Writes nothing. */
async function main(): Promise<void> {
  const ids = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const db = getDb();
  try {
    const catalogue = await loadCatalogueIndex(db);
    const jev = createJevClient();
    const { rows } = await db.query(
      `select sp.id, sp.source, sp.title, sp.description, sp.raw_latest_payload, null::text as evidence_hash from public.store_products sp where sp.id = any($1::bigint[]) order by sp.id`,
      [ids]
    );
    for (const row of rows) {
      const c = await classifyListing(buildListingEvidence({ ...row, id: Number(row.id) }), catalogue, jev);
      console.log(`#${row.id} ${row.title}\n   -> ${c.reviewStatus} | ${c.product ? c.product.season + ' ' + c.product.productLine : '-'} | ${c.subset?.name ?? '-'} | ${c.card ? '#' + c.card.cardNumber : '-'} | reasons: ${c.reviewReasons.join(',')}\n      ${c.matchReasons.join(' || ')}`);
    }
  } finally {
    await closeDb();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
