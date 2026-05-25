import fs from 'node:fs';
import path from 'node:path';

function readRootFile(...segments: string[]): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', ...segments), 'utf8');
}

function readWebFile(...segments: string[]): string {
  return readRootFile('web', 'src', ...segments);
}

describe('CAR-37 Stage 1 catalogue-backed watchlist foundation', () => {
  const migration = readRootFile('supabase', 'migrations', '20260525000000_stage1_catalogue_watchlist_foundation.sql');
  const catalogueOptions = readWebFile('lib', 'catalogue-options.ts');
  const watchlistActions = readWebFile('lib', 'watchlist-actions.ts');
  const watchlistFormFields = readWebFile('app', 'watchlists', 'watchlist-form-fields.tsx');
  const detailPage = readWebFile('app', 'watchlists', '[id]', 'page.tsx');

  it('adds only additive structured rule fields for catalogue-backed intent', () => {
    expect(migration).toContain('add column if not exists intent_type');
    expect(migration).toContain('add column if not exists catalogue_card_id');
    expect(migration).toContain('add column if not exists catalogue_variant_id');
    expect(migration).toContain("check (intent_type in ('custom', 'player', 'team', 'set', 'card', 'variant'))");
    expect(migration).toContain('create index if not exists idx_watchlist_rules_catalogue_card_id');
    expect(migration).not.toContain('drop column');
    expect(migration).not.toContain('delete from public.watchlists');
    expect(migration).not.toContain('delete from public.watchlist_rules');
  });

  it('queries catalogue-backed options from existing catalogue tables', () => {
    expect(catalogueOptions).toContain('export async function getWatchlistCatalogueOptions');
    expect(catalogueOptions).toContain('from public.players');
    expect(catalogueOptions).toContain('from public.teams');
    expect(catalogueOptions).toContain('from public.card_catalogue_sets');
    expect(catalogueOptions).toContain('from public.card_catalogue_cards');
    expect(catalogueOptions).toContain('from public.card_catalogue_variants');
  });

  it('wires create and edit forms to structured fields while preserving include_terms', () => {
    expect(watchlistFormFields).toContain('name="player_id"');
    expect(watchlistFormFields).toContain('name="set_id"');
    expect(watchlistFormFields).toContain('name="catalogue_card_id"');
    expect(watchlistFormFields).toContain('name="catalogue_variant_id"');
    expect(watchlistFormFields).toContain('name="include_terms"');
    expect(watchlistFormFields).toContain('<datalist');
    expect(detailPage).toContain('updateWatchlistAction');
    expect(detailPage).toContain('Edit Watchlist');
    expect(watchlistActions).toContain('intent_type: watchlistInput.intentType');
    expect(watchlistActions).toContain('include_terms:');
  });

  it('does not change matching, reconciliation, or alert implementations in this stage', () => {
    const reconciliation = readRootFile('engine', 'src', 'watchlist-reconciliation.ts');
    const backfillSql = readWebFile('lib', 'watchlist-backfill-sql.ts');
    const alerts = readWebFile('lib', 'alerts.ts');

    expect(reconciliation).not.toContain('catalogue_variant_id');
    expect(backfillSql).not.toContain('catalogue_variant_id');
    expect(alerts).not.toContain('intent_type');
  });
});
