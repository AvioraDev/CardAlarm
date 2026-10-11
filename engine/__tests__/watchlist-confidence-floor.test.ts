import fs from 'fs';
import path from 'path';
import { buildCanonicalBackfillSql, type CanonicalBackfillRule } from '../../web/src/lib/watchlist-backfill-sql';

// CAR-58. These assert the SQL's shape; the status outcomes (0.40 -> possible, 0.90 -> current,
// rule minimum 0.9 raises the bar, rule minimum 0.5 never drops it below 0.75) were verified against
// Postgres with the same expressions.
const REAL_CONFIDENCE = "coalesce(case when pc.classifier_type = 'jev' then pc.confidence else pcm.confidence end, 0)";

function rule(overrides: Partial<CanonicalBackfillRule> = {}): CanonicalBackfillRule {
  return {
    id: 20, watchlist_id: 10, player_id: 7, brand: null, product_line: null, season: null, card_number: null,
    parallel: null, rookie_only: false, autograph_only: false, relic_only: false, serial_numbered_only: false,
    graded_only: false, raw_only: false, min_price: null, max_price: null, include_terms: null, exclude_terms: null,
    minimum_match_confidence: 0.5,
    ...overrides,
  };
}

function squash(sql: string) {
  return sql.replace(/\s+/g, ' ');
}

describe('watchlist match confidence (CAR-58)', () => {
  const reconciliation = squash(fs.readFileSync(path.join(__dirname, '../src/watchlist-reconciliation.ts'), 'utf8'));
  const backfill = squash(buildCanonicalBackfillSql(rule())!.sql);

  it.each([
    ['reconciliation', reconciliation],
    ['backfill', backfill],
  ])('%s stores the real classifier confidence, not a floored one', (_name, sql) => {
    expect(sql).toContain(`${REAL_CONFIDENCE}::numeric(5, 4)`);
    expect(sql).not.toMatch(/greatest\(\s*coalesce\(case when pc\.classifier_type/);
  });

  it.each([
    ['reconciliation', reconciliation, 'greatest(coalesce(wr.minimum_match_confidence, 0.75), 0.75)'],
    ['backfill', backfill, 'greatest($'],
  ])('%s keeps a match Possible below max(rule minimum, 0.75)', (_name, sql, bar) => {
    expect(sql).toContain(`${REAL_CONFIDENCE} < ${bar}`);
    expect(sql).toContain("then 'possible'");
  });

  it('backfill passes the rule minimum as a numeric parameter', () => {
    const built = buildCanonicalBackfillSql(rule({ minimum_match_confidence: 0.9 }))!;
    expect(built.params).toContain(0.9);
    expect(squash(built.sql)).toMatch(/greatest\(\$\d+::numeric, 0\.75\)/);
  });
});
