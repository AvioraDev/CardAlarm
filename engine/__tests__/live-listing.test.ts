import fs from 'node:fs';
import path from 'node:path';
import { liveListingSql as webLive, STALE_AFTER_SCAN_INTERVALS as webIntervals, DEFAULT_SCAN_FREQUENCY_MINUTES as webDefault } from '../../web/src/lib/live-listing';
import { liveListingSql, STALE_AFTER_SCAN_INTERVALS, DEFAULT_SCAN_FREQUENCY_MINUTES } from '../src/live-listing';
import { buildCanonicalBackfillSql } from '../../web/src/lib/watchlist-backfill-sql';
import { buildInventoryWhereSql } from '../../web/src/lib/inventory-sql';
import { otherListingsSql } from '../../web/src/lib/other-listings-sql';
import { reconcileActiveWatchlistMatches } from '../src/watchlist-reconciliation';
import { enqueueAlertCandidates } from '../src/alerts';
import { missingCurrentVersionSql } from '../src/classify/coverage-check';

/**
 * CAR-96: customers never see a listing from an inactive store or one not seen in a recent successful scan.
 * One shared rule, used by every customer-facing reader, alert and the coverage check.
 */
describe('live listing rule', () => {
  const rule = liveListingSql('sp');

  it('is the same in the web app and the engine', () => {
    expect(webLive('sp')).toBe(rule);
    expect([webIntervals, webDefault]).toEqual([STALE_AFTER_SCAN_INTERVALS, DEFAULT_SCAN_FREQUENCY_MINUTES]);
  });

  it('needs an active store, a recent successful scan of it, and a recently seen listing', () => {
    expect(rule).toContain('sp.is_active = true');
    expect(rule).toContain('sp.current_availability = true');
    expect(rule).toContain('live_store.is_active = true');
    expect(rule).toContain('live_store.last_successful_scan_at >= now() - make_interval(mins => 2 * coalesce(live_store.scan_frequency_minutes, 1440))');
    expect(rule).toContain('sp.last_seen_at >= now() - make_interval(mins => 2 * coalesce(live_store.scan_frequency_minutes, 1440))');
  });

  it('is built from the store\'s own scan frequency, not a fixed number of hours', () => {
    expect(rule).toContain('scan_frequency_minutes');
    expect(STALE_AFTER_SCAN_INTERVALS).toBe(2);
  });

  it('is used by every customer-facing reader, the alerts and the coverage check', async () => {
    const queries: string[] = [];
    const db = { query: async (sql: string) => { queries.push(sql); return { rows: [{ started_at: new Date() }], rowCount: 0 }; } };
    await reconcileActiveWatchlistMatches(db as never);
    await enqueueAlertCandidates(db as never);
    const rule2 = { id: 1, watchlist_id: 1, player_id: 5, brand: null, product_line: null, season: null, card_number: null, parallel: null, rookie_only: false, autograph_only: false, relic_only: false, serial_numbered_only: false, graded_only: false, raw_only: false, min_price: null, max_price: null, include_terms: null, exclude_terms: null, minimum_match_confidence: 0.75 };
    const sqls = [
      // The retire step deletes stale matches on listings that are still flagged live, so it deliberately does not use the rule.
      ...queries.filter(sql => (sql.includes('watchlist_matches') || sql.includes('alerts')) && !sql.startsWith('delete from')),
      buildCanonicalBackfillSql(rule2)!.sql,
      buildInventoryWhereSql({}).whereSql ?? '',
      otherListingsSql(),
      missingCurrentVersionSql(),
    ];
    for (const sql of sqls) {
      expect(sql).toContain(rule);
      expect(sql).not.toContain('${');
    }
  });

  it('the customer-facing sources no longer hard-code availability on its own', () => {
    for (const file of ['web/src/lib/queries.ts', 'web/src/lib/actions.ts', 'web/src/lib/alerts.ts', 'web/src/lib/inventory-sql.ts', 'web/src/lib/watchlist-backfill-sql.ts', 'web/src/lib/other-listings-sql.ts', 'engine/src/watchlist-reconciliation.ts', 'engine/src/alerts.ts']) {
      const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
      expect(source).toContain('liveListingSql(');
      if (file.startsWith('web/')) expect(source).not.toMatch(/sp\.current_availability = true["'`\s]*(,|\))?\s*$/m);
    }
  });
});
