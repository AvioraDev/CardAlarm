import fs from 'fs';
import path from 'path';

// D-001 kept Jev in shadow (readers saw only deterministic rows). D-008 supersedes it: readers read the Jev classifier,
// but only through the one shared filter, so the setting that rolls back to Standard governs all of them.
const readers = [
  'engine/src/watchlist-reconciliation.ts',
  'web/src/lib/watchlist-backfill-sql.ts',
  'web/src/lib/inventory-sql.ts',
  'web/src/lib/admin-scan-qa.ts',
];

describe('Reader classification (D-008, supersedes the D-001 shadow)', () => {
  it.each(readers)('%s takes its classification filter from the shared reader module', file => {
    const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
    expect(source).toContain('readerClassificationFilterSql(');
    expect(source).not.toContain("classifier_type = 'deterministic'");
    expect(source).not.toMatch(/classifier_type in \([^)]*'jev'/);
  });
});
