import fs from 'fs';
import path from 'path';

// CAR-69 / D-001: Jev classifies and stores rows but must not influence matches or inventory
// until it beats the deterministic classifier on the labelled set (CAR-63).
const readers = [
  'engine/src/watchlist-reconciliation.ts',
  'web/src/lib/watchlist-backfill-sql.ts',
  'web/src/lib/inventory-sql.ts',
  'web/src/lib/admin-scan-qa.ts',
];

describe('Jev shadow mode (D-001)', () => {
  it.each(readers)('%s reads only deterministic classifications', file => {
    const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
    expect(source).toContain("classifier_type = 'deterministic'");
    expect(source).not.toMatch(/classifier_type in \([^)]*'jev'/);
  });
});
