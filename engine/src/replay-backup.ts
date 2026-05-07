import BackupDatabase from 'better-sqlite3';
import {
  closeDb,
  createScanRun,
  getActiveWatchlistPlayers,
  getAllChecklistPlayerNames,
  getDb,
  updateScanRun,
} from './db';
import { processListingWithCache } from './match';
import type { RawListing } from './types';

const backupPath = process.argv[2];

if (!backupPath) {
  console.error('Usage: npx tsx engine/src/replay-backup.ts <backup-db-path>');
  process.exit(1);
}

const backup = new BackupDatabase(backupPath, { readonly: true });
const current = getDb();

current.exec(`
  DELETE FROM listings_feed;
  DELETE FROM source_products;
  DELETE FROM scan_runs;
  DELETE FROM sqlite_sequence WHERE name IN ('listings_feed', 'source_products', 'scan_runs');
`);

const rows = backup.prepare(`
  SELECT external_id, source, title, price, url, image_url
  FROM listings_feed
  WHERE is_oos = 0
  ORDER BY id
`).all() as Array<{
  external_id: string;
  source: string;
  title: string | null;
  price: number | null;
  url: string | null;
  image_url: string | null;
}>;

const watchlistEntries = getActiveWatchlistPlayers(current);
const watchlistNameSet = new Set(watchlistEntries.map(entry => entry.player_name.toLowerCase()));
const allPlayerNames = getAllChecklistPlayerNames(current);
const runId = createScanRun(current, 'watchlist');

let processed = 0;
let matched = 0;

for (const row of rows) {
  const listing: RawListing = {
    externalId: String(row.external_id),
    source: String(row.source),
    title: row.title ?? '',
    price: Number(row.price ?? 0),
    url: row.url ?? '',
    imageUrl: row.image_url ?? '',
  };

  processed++;
  const result = processListingWithCache(
    current,
    listing,
    watchlistEntries,
    watchlistNameSet,
    allPlayerNames
  );

  if (result.matched) matched++;
}

updateScanRun(current, runId, { processed, matched, status: 'completed' });

console.log(JSON.stringify({
  replayed: rows.length,
  processed,
  matched,
  watchlist: watchlistEntries.map(entry => entry.player_name),
}, null, 2));

backup.close();
closeDb();
