/**
 * One-time backfill: parse all existing listings_feed rows and populate
 * the new metadata columns. Safe to re-run (only updates rows where
 * category IS NULL, meaning they haven't been backfilled yet).
 *
 * Usage: npx tsx engine/src/backfill-metadata.ts
 */
import { getDb, closeDb } from './sqlite-test-db';
import { parseTitleMetadata } from './parse-title';

const db = getDb();

interface BackfillRow {
  id: number;
  title: string;
}

const rows = db.prepare(
  'SELECT id, title FROM listings_feed WHERE category IS NULL'
).all() as BackfillRow[];

console.log(`Backfilling ${rows.length} rows...`);

const updateStmt = db.prepare(`
  UPDATE listings_feed SET
    year = ?,
    set_name = ?,
    card_number = ?,
    player_name = COALESCE(player_name, ?),
    variant = ?,
    is_serial = ?,
    serial_number = ?,
    is_auto = ?,
    is_rookie = ?,
    category = ?
  WHERE id = ?
`);

const batchUpdate = db.transaction((batch: BackfillRow[]) => {
  for (const row of batch) {
    const meta = parseTitleMetadata(row.title);
    updateStmt.run(
      meta.year,
      meta.setName,
      meta.cardNumber,
      meta.playerName,
      meta.variant,
      meta.isSerial ? 1 : 0,
      meta.serialNumber,
      meta.isAuto ? 1 : 0,
      meta.isRookie ? 1 : 0,
      meta.category,
      row.id,
    );
  }
});

batchUpdate(rows);

console.log(`✅ Backfill complete. Updated ${rows.length} rows.`);

// Verify: show category distribution
interface CategoryCount {
  category: string | null;
  c: number;
}
const dist = db.prepare(
  'SELECT category, COUNT(*) as c FROM listings_feed GROUP BY category ORDER BY c DESC'
).all() as CategoryCount[];

console.log('\nCategory distribution:');
for (const d of dist) {
  console.log(`  ${d.category ?? 'NULL'}: ${d.c}`);
}

closeDb();
