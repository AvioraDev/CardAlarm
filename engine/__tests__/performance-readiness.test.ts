import fs from 'node:fs';
import path from 'node:path';

function readRootFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8');
}

function readWebFile(...segments: string[]): string {
  return readRootFile('web', 'src', ...segments);
}

describe('CAR-16 performance readiness', () => {
  const migration = readRootFile('supabase', 'migrations', '20260513002000_baseline_performance_indexes.sql');

  it('adds baseline indexes for canonical inventory and admin scan paths', () => {
    expect(migration).toContain('idx_store_products_active_current_recent');
    expect(migration).toContain('where is_active = true and current_availability = true');
    expect(migration).toContain('idx_store_products_active_source_price');
    expect(migration).toContain('idx_scan_runs_running_started');
    expect(migration).toContain('idx_store_scan_runs_running_store');
    expect(migration).toContain('idx_stores_admin_list');
  });

  it('adds baseline indexes for watchlist matches, feedback, and card matches', () => {
    expect(migration).toContain('idx_product_card_matches_product_confidence_recent');
    expect(migration).toContain('idx_watchlist_matches_watchlist_product_recent');
    expect(migration).toContain('idx_match_feedback_user_product_type_recent');
    expect(migration).toContain('idx_watchlists_user_active_updated');
  });

  it('adds product classification indexes conditionally for existing Supabase table', () => {
    expect(migration).toContain("if to_regclass('public.product_classifications') is not null then");
    expect(migration).toContain('idx_product_classifications_latest_deterministic');
    expect(migration).toContain('idx_product_classifications_deterministic_year');
    expect(migration).toContain('idx_product_classifications_deterministic_set');
    expect(migration).toContain('idx_product_classifications_deterministic_variant');
    expect(migration).toContain("where classifier_type = ''deterministic''");
  });

  it('keeps admin inventory paginated and customer dashboard watchlist-scoped', () => {
    const adminInventory = readWebFile('app', 'admin', 'inventory', 'page.tsx');
    const dashboard = readWebFile('app', 'dashboard', 'page.tsx');

    expect(adminInventory).toContain('const pageSize = 48');
    expect(adminInventory).toContain('getActiveFeed(cleanFilters, { limit: pageSize, offset: (currentPage - 1) * pageSize })');
    expect(adminInventory).toContain('getFilterFacets()');
    expect(dashboard).toContain('getUserWatchlistFeed(user.id, cleanFilters)');
    expect(dashboard).toContain('getUserWatchlistFilterFacets(user.id, cleanFilters)');
    expect(dashboard).not.toContain('getActiveFeed');
    expect(dashboard).not.toContain('getFilterFacets');
  });

  it('adds sanitized opt-in DB query timing logs for web and engine gateways', () => {
    const webDb = readWebFile('lib', 'db.ts');
    const engineDb = readRootFile('engine', 'src', 'db.ts');

    for (const dbFile of [webDb, engineDb]) {
      expect(dbFile).toContain('CARDALARM_DB_QUERY_TIMING');
      expect(dbFile).toContain('CARDALARM_DB_QUERY_TIMING_MIN_MS');
      expect(dbFile).toContain('queryFingerprint(sql)');
      expect(dbFile).toContain('durationMs');
      expect(dbFile).toContain('rowCount');
      expect(dbFile).not.toContain('params,');
    }
  });
});
