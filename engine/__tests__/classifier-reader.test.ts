import fs from 'node:fs';
import path from 'node:path';
import {
  classifierReader as webReader,
  JEV_READER_VERSION as webVersion,
  readerClassificationFilterSql as webFilter,
  readerPossibleSql as webPossible,
} from '../../web/src/lib/classifier-reader';
import { classifierReader, JEV_READER_VERSION, readerClassificationFilterSql, readerPossibleSql } from '../src/classifier-reader';
import { JEV_CLASSIFIER_VERSION } from '../src/classify/classifier';
import { reconcileActiveWatchlistMatches } from '../src/watchlist-reconciliation';
import { buildCanonicalBackfillSql, productClassificationLateralJoinSql } from '../../web/src/lib/watchlist-backfill-sql';
import { inventoryClassificationJoinSql, inventoryClassificationSetJoinSql } from '../../web/src/lib/inventory-sql';
import { OTHER_LISTINGS_CLASSIFIER_VERSION } from '../../web/src/lib/other-listings-sql';

/**
 * D-008 / CAR-94: every customer-facing reader takes its classification filter from one place, reads the Jev
 * classifier by default, and rolls back to Standard with one setting.
 */

const rule = {
  id: 1, watchlist_id: 1, player_id: 5, brand: null, product_line: null, season: null, card_number: null, parallel: null,
  rookie_only: false, autograph_only: false, relic_only: false, serial_numbered_only: false, graded_only: false, raw_only: false,
  min_price: null, max_price: null, include_terms: null, exclude_terms: null, minimum_match_confidence: 0.75,
};

describe('classifier reader setting', () => {
  const original = process.env.CARDALARM_CLASSIFIER_READER;
  afterEach(() => {
    if (original === undefined) delete process.env.CARDALARM_CLASSIFIER_READER;
    else process.env.CARDALARM_CLASSIFIER_READER = original;
  });

  it('defaults to Jev, and one setting rolls back to Standard', () => {
    delete process.env.CARDALARM_CLASSIFIER_READER;
    expect([webReader(), classifierReader()]).toEqual(['jev', 'jev']);
    process.env.CARDALARM_CLASSIFIER_READER = 'standard';
    expect([webReader(), classifierReader()]).toEqual(['standard', 'standard']);
    process.env.CARDALARM_CLASSIFIER_READER = ' Standard ';
    expect(webReader()).toBe('standard');
    // Anything else is the default, not an accident that disables the new classifier silently.
    process.env.CARDALARM_CLASSIFIER_READER = 'nonsense';
    expect(webReader()).toBe('jev');
  });

  it('web and engine produce the same SQL, for the version the engine writes', () => {
    expect(webVersion).toBe(JEV_CLASSIFIER_VERSION);
    expect(JEV_READER_VERSION).toBe(JEV_CLASSIFIER_VERSION);
    expect(OTHER_LISTINGS_CLASSIFIER_VERSION).toBe(JEV_CLASSIFIER_VERSION);
    for (const reader of ['jev', 'standard'] as const) {
      expect(webFilter('pc', reader)).toBe(readerClassificationFilterSql('pc', reader));
    }
    expect(webPossible('pc')).toBe(readerPossibleSql('pc'));
  });

  it('Jev mode names the version and only accepted and possible rows; Standard mode is the old filter', () => {
    expect(readerClassificationFilterSql('pc', 'jev')).toBe(
      `pc.classifier_type = 'jev' and pc.classifier_version = '${JEV_CLASSIFIER_VERSION}' and pc.review_status in ('accepted', 'possible')`
    );
    expect(readerClassificationFilterSql('pc', 'standard')).toBe("pc.classifier_type = 'deterministic'");
  });

  it('every reader uses the shared filter in both modes, and none still hard-codes Standard', async () => {
    for (const mode of ['jev', 'standard']) {
      process.env.CARDALARM_CLASSIFIER_READER = mode;
      const expected = readerClassificationFilterSql('pc', mode as 'jev' | 'standard');
      const backfill = buildCanonicalBackfillSql(rule)!.sql;
      const queries: string[] = [];
      const db = { query: async (sql: string) => { queries.push(sql); return { rows: [{ started_at: new Date() }], rowCount: 0 }; } };
      await reconcileActiveWatchlistMatches(db as never);
      const reconcile = queries.find(sql => sql.includes('watchlist_matches'))!;

      for (const sql of [productClassificationLateralJoinSql(), inventoryClassificationJoinSql(), inventoryClassificationSetJoinSql(), backfill, reconcile]) {
        expect(sql).toContain(expected);
        expect(sql).not.toContain('${');
        if (mode === 'jev') expect(sql).not.toContain("classifier_type = 'deterministic'");
      }
    }
  });

  it('a Jev "possible" is stored as a possible match, not a confirmed one', async () => {
    process.env.CARDALARM_CLASSIFIER_READER = 'jev';
    expect(buildCanonicalBackfillSql(rule)!.sql).toContain(readerPossibleSql('pc'));
    const queries: string[] = [];
    await reconcileActiveWatchlistMatches({ query: async (sql: string) => { queries.push(sql); return { rows: [{ started_at: new Date() }], rowCount: 0 }; } } as never);
    expect(queries.find(sql => sql.includes('watchlist_matches'))).toContain(readerPossibleSql('pc'));
  });

  it('the admin scan QA reader uses the shared filter', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../web/src/lib/admin-scan-qa.ts'), 'utf8');
    expect(source).toContain('readerClassificationFilterSql("pc")');
    expect(source).not.toContain("classifier_type = 'deterministic'");
  });
});
