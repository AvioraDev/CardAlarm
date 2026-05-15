import fs from 'node:fs';
import path from 'node:path';

function readRootFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8');
}

describe('CAR-33 scan and watchlist relevance boundary', () => {
  const ingestSource = readRootFile('engine', 'src', 'ingest.ts');
  const reconciliationSource = readRootFile('engine', 'src', 'watchlist-reconciliation.ts');
  const backfillSqlSource = readRootFile('web', 'src', 'lib', 'watchlist-backfill-sql.ts');
  const migration = readRootFile('supabase', 'migrations', '20260514000000_sanitize_rookie_identity_matches.sql');

  it('does not run user watchlist matching inside scan ingestion', () => {
    expect(ingestSource).not.toContain('processListingWithCache');
    expect(ingestSource).not.toContain('getActiveWatchlistPlayers');
    expect(ingestSource).not.toContain('getAllChecklistPlayerNames');
    expect(ingestSource).not.toContain('getChecklistsByNumbers');
    expect(ingestSource).not.toContain('createChecklistLookup');
    expect(ingestSource).toContain('buildIdentityContextHash');
    expect(ingestSource).toContain('markSourceProductsMatched(db, source.slug, evaluatedCacheRows, identityContextHash)');
  });

  it('keeps watchlist reconciliation downstream of scan cache/classification work', () => {
    expect(ingestSource.indexOf('reconcileActiveWatchlistMatches(db)')).toBeGreaterThan(
      ingestSource.indexOf('const totalProcessed')
    );
    expect(ingestSource).toContain('enqueueAlertCandidates(db)');
    expect(ingestSource).toContain('processPendingAlerts(db)');
    expect(ingestSource).toContain('matched: reconciledMatches');
  });

  it('runs stores through bounded concurrency before one downstream reconciliation pass', () => {
    expect(ingestSource).toContain('export async function runWithConcurrency');
    expect(ingestSource).toContain('export function scanStoreConcurrency');
    expect(ingestSource).toContain('await runWithConcurrency(sources, storeConcurrency, processStore)');
    expect(ingestSource).not.toContain('Promise.all(sources');
    expect(ingestSource.match(/reconcileActiveWatchlistMatches\(db\)/g)).toHaveLength(1);
    expect(ingestSource.match(/enqueueAlertCandidates\(db\)/g)).toHaveLength(1);
    expect(ingestSource.match(/processPendingAlerts\(db\)/g)).toHaveLength(1);
  });

  it('requires deterministic classifications for scan-triggered watchlist reconciliation', () => {
    expect(reconciliationSource).toContain('from public.product_classifications pc');
    expect(reconciliationSource).toContain("pc.category = 'NBA'");
    expect(reconciliationSource).toContain("trim(term) !~* '^(rookie|rookies|rc)$'");
    expect(reconciliationSource).toContain("trim(term) ~* '^(rookie|rookies|rc)$'");
    expect(reconciliationSource).toContain('coalesce(pc.is_rookie');
    expect(reconciliationSource).not.toContain('coalesce(pcm.match_reasons::text');
  });

  it('builds user backfill from store products and classifications without listings_feed', () => {
    expect(backfillSqlSource).toContain('from public.store_products sp');
    expect(backfillSqlSource).toContain('from public.product_classifications pc');
    expect(backfillSqlSource).toContain("pc.category = 'NBA'");
    expect(backfillSqlSource).toContain('productClassificationLateralJoinSql');
    expect(backfillSqlSource).not.toContain('listings_feed');
  });

  it('cleans corrupted rookie identity product matches without changing schema', () => {
    expect(migration).toContain("where lower(trim(coalesce(matched_player_name, ''))) in ('rookie', 'rookies', 'rc')");
    expect(migration).toContain('matched_player_name = null');
    expect(migration).toContain('matched_player_id = null');
    expect(migration).toContain("where lower(field) <> 'player'");
    expect(migration).toContain("where reason <> 'Watchlist player name found in title'");
    expect(migration).not.toContain('alter table');
    expect(migration).not.toContain('create table');
  });
});
